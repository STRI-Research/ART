import { auditLog } from '@/lib/db/schema'
import { getActor } from '@/lib/actor'
import type { getDb } from '@/lib/db'

type Db = ReturnType<typeof getDb>

export interface AuditEvent {
  protocolId?: number
  trialId?: number
  role: 'protocol' | 'trial'
  /** Machine action code, e.g. "treatment.rename", "component.rate.change". */
  action: string
  entity: string
  summary: string
  /** Bounded structured detail (kept small — field diffs, not entity dumps). */
  detail?: Record<string, unknown>
  /** Field-level before/after values for meaningful domain changes. */
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  /** User-supplied reason, where the action requires one. */
  reason?: string
  documentVersion?: number
}

/**
 * Central audit writer. Failures never break the calling operation (audit is best-effort at
 * this layer; operations that legally require an audit row should write it inside their own
 * transaction instead).
 */
export async function logAudit(db: Db, e: AuditEvent): Promise<void> {
  try {
    const actor = await getActor()
    await db.insert(auditLog).values({
      protocolId: e.protocolId,
      trialId: e.trialId,
      role: e.role,
      actor,
      action: e.action,
      entity: e.entity,
      summary: e.summary,
      detail: JSON.stringify(e.detail ?? {}),
      beforeJson: e.before ?? null,
      afterJson: e.after ?? null,
      reason: e.reason ?? '',
      documentVersion: e.documentVersion,
    })
  } catch {
    // best-effort
  }
}
