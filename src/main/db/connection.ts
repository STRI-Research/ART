import { randomUUID } from 'crypto'
import Database from 'better-sqlite3'
import type { Role } from '@shared/types.js'
import schemaSql from './schema.sql?raw'

const SCHEMA_VERSION = '2'

/**
 * Opens (or creates) an ART SQLite file and ensures the schema is applied.
 * A file is either a protocol (authored template) or a trial (local instance);
 * meta.role records which. A single Database handle is held per process; opening
 * a new file closes the previous one.
 */
let current: Database.Database | null = null
let currentPath: string | null = null
let currentRole: Role = 'protocol'

export interface OpenOptions {
  /** Role to stamp on a freshly created file. Ignored when opening an existing file. */
  role?: Role
  /** When true, a new file is being created (seed the protocol row + meta). */
  create?: boolean
}

export function openProject(filePath: string, opts: OpenOptions = {}): Database.Database {
  closeProject()
  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(schemaSql)

  // Ensure the singleton protocol row exists (with a stable uid) and meta is seeded.
  db.prepare(
    `INSERT OR IGNORE INTO protocol (id, protocol_uid, protocol_version) VALUES (1, ?, 1)`
  ).run(randomUUID())
  db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run(
    'schema_version',
    SCHEMA_VERSION
  )
  if (opts.create && opts.role) {
    db.prepare(
      `INSERT INTO meta (key, value) VALUES ('role', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    ).run(opts.role)
  }

  const roleRow = db.prepare(`SELECT value FROM meta WHERE key = 'role'`).get() as
    | { value: string }
    | undefined
  currentRole = roleRow?.value === 'trial' ? 'trial' : 'protocol'

  current = db
  currentPath = filePath
  return db
}

export function getDb(): Database.Database {
  if (!current) throw new Error('No project is open')
  return current
}

export function getCurrentPath(): string | null {
  return currentPath
}

export function getRole(): Role {
  return currentRole
}

export function closeProject(): void {
  if (current) {
    current.close()
    current = null
    currentPath = null
    currentRole = 'protocol'
  }
}
