import Database from 'better-sqlite3'
import schemaSql from './schema.sql?raw'

const SCHEMA_VERSION = '1'

/**
 * Opens (or creates) a project SQLite file and ensures the schema is applied.
 * A single Database handle is held per process; opening a new project closes
 * the previous one.
 */
let current: Database.Database | null = null
let currentPath: string | null = null

export function openProject(filePath: string): Database.Database {
  closeProject()
  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(schemaSql)

  // Ensure the singleton protocol row and schema version exist.
  db.prepare('INSERT OR IGNORE INTO protocol (id) VALUES (1)').run()
  db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run(
    'schema_version',
    SCHEMA_VERSION
  )

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

export function closeProject(): void {
  if (current) {
    current.close()
    current = null
    currentPath = null
  }
}
