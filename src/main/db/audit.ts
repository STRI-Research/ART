import { userInfo } from 'os'
import type Database from 'better-sqlite3'
import { getDb, getRole } from './connection.js'
import type { AuditEntry } from '@shared/types.js'

/**
 * GEP/GLP audit trail. Every data-changing IPC handler calls recordAudit after a
 * successful write; entries are append-only and stored in the current file. The
 * actor is the OS account (no in-app login) — captured here, never trusted from
 * the renderer.
 */

let cachedActor = ''
function actor(): string {
  if (!cachedActor) {
    try {
      cachedActor = userInfo().username || 'unknown'
    } catch {
      cachedActor = 'unknown'
    }
  }
  return cachedActor
}

export function recordAudit(
  action: string,
  entity: string,
  summary: string,
  detail: Record<string, unknown> = {},
  db: Database.Database = getDb()
): void {
  db.prepare(
    `INSERT INTO audit_log (actor, role, action, entity, summary, detail)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(actor(), getRole(), action, entity, summary, JSON.stringify(detail))
}

export function listAudit(db: Database.Database = getDb()): AuditEntry[] {
  const rows = db
    .prepare(`SELECT * FROM audit_log ORDER BY id DESC`)
    .all() as Record<string, unknown>[]
  return rows.map((r) => {
    let detail: Record<string, unknown> = {}
    try {
      detail = JSON.parse((r.detail as string) || '{}')
    } catch {
      detail = {}
    }
    return {
      id: r.id as number,
      ts: r.ts as string,
      actor: r.actor as string,
      role: r.role as AuditEntry['role'],
      action: r.action as string,
      entity: r.entity as string,
      summary: r.summary as string,
      detail
    }
  })
}
