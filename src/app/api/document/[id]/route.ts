import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { applicationDocument, applicationEvent } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { checkTwoPerson, canTransition, type DocStatus } from '@shared/approval'
import { hasRole } from '@shared/roles'
import { notify, userById, hashSnapshot, buildSnapshot } from '@/lib/documents'
import { logAudit } from '@/lib/audit'
import { getSessionUser } from '@/lib/users'
import type { DocumentSnapshot } from '@shared/approval'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function badRequest(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()
  const [doc] = await db.select().from(applicationDocument).where(eq(applicationDocument.id, Number(id)))
  if (!doc) return badRequest('Document not found', 404)
  const [firstChecker, approver, approvedBy] = await Promise.all([
    userById(db, doc.firstCheckById),
    userById(db, doc.assignedApproverId),
    userById(db, doc.approvedById),
  ])
  return NextResponse.json({
    ...doc,
    firstCheckerName: firstChecker?.name ?? firstChecker?.email ?? '',
    approverName: approver?.name ?? approver?.email ?? '',
    approvedByName: approvedBy?.name ?? approvedBy?.email ?? '',
  })
}

/**
 * Approval actions on a document version: approve (Research Manager role, two-person rule,
 * version echo — you approve exactly what you reviewed), return (required reason), withdraw
 * (preparer, before approval). All identities come from the server session, never the client.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const documentId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return badRequest('Unauthorized', 401)

  const [doc] = await db.select().from(applicationDocument).where(eq(applicationDocument.id, documentId))
  if (!doc) return badRequest('Document not found', 404)
  const [ev] = await db.select().from(applicationEvent).where(eq(applicationEvent.id, doc.eventId))
  if (!ev) return badRequest('Event not found', 404)

  const body = z
    .object({
      action: z.enum(['approve', 'return', 'withdraw']),
      versionNumber: z.number().int(),
      reason: z.string().default(''),
      comments: z.string().default(''),
    })
    .safeParse(await req.json().catch(() => ({})))
  if (!body.success) return badRequest(body.error.message)
  const { action, versionNumber, reason, comments } = body.data

  if (versionNumber !== doc.versionNumber) {
    return badRequest(
      `You reviewed version ${versionNumber} but the current version is ${doc.versionNumber} — reload and review the current version`,
      409
    )
  }
  if (doc.status !== 'awaiting_approval') {
    return badRequest(`This version is ${doc.status} — no approval action is possible`, 409)
  }

  const now = new Date()

  if (action === 'approve') {
    if (!hasRole(user.roles, 'research_manager')) {
      return badRequest('Approval requires the Research Manager role', 403)
    }
    if (doc.assignedApproverId !== user.id && !hasRole(user.roles, 'admin')) {
      return badRequest('This application was submitted to a different approver', 403)
    }
    const two = checkTwoPerson(doc.firstCheckById, user.id)
    if (!two.ok) return badRequest(two.error!, 409)

    // The version being approved must still match live inputs — a stale hash means a material
    // change slipped in between review and approval.
    const snapshot = await buildSnapshot(db, doc.eventId)
    if (!snapshot || hashSnapshot(snapshot) !== doc.inputHash) {
      await db
        .update(applicationDocument)
        .set({ status: 'superseded', supersededAt: now })
        .where(eq(applicationDocument.id, doc.id))
      return badRequest(
        'The application changed after this version was submitted — it has been superseded and must be checked again',
        409
      )
    }

    if (!canTransition(doc.status as DocStatus, 'approved')) return badRequest('Invalid transition', 409)
    await db
      .update(applicationDocument)
      .set({ status: 'approved', approvedById: user.id, approvedAt: now, comments: comments || doc.comments })
      .where(eq(applicationDocument.id, doc.id))
    await notify(db, doc.firstCheckById, 'approval_granted', {
      documentRef: doc.documentRef,
      eventId: ev.id,
      by: user.name || user.email,
    })
    await logAudit(db, {
      trialId: ev.trialId,
      role: 'trial',
      action: 'document.approve',
      entity: `document:${doc.id}`,
      summary: `Research Manager approval completed for ${doc.documentRef} by ${user.name || user.email} — approved for application`,
      documentVersion: doc.versionNumber,
      detail: { comments },
    })
  } else if (action === 'return') {
    if (doc.assignedApproverId !== user.id && !hasRole(user.roles, 'admin')) {
      return badRequest('Only the assigned approver can return this application', 403)
    }
    if (!reason.trim()) return badRequest('A reason is required when returning for changes')
    await db
      .update(applicationDocument)
      .set({ status: 'returned', returnReason: reason })
      .where(eq(applicationDocument.id, doc.id))
    await notify(db, doc.firstCheckById, 'approval_returned', {
      documentRef: doc.documentRef,
      eventId: ev.id,
      reason,
      by: user.name || user.email,
    })
    await logAudit(db, {
      trialId: ev.trialId,
      role: 'trial',
      action: 'document.return',
      entity: `document:${doc.id}`,
      summary: `${doc.documentRef} returned for changes by ${user.name || user.email}`,
      documentVersion: doc.versionNumber,
      reason,
    })
  } else {
    // withdraw — the preparer takes it back before approval.
    if (doc.firstCheckById !== user.id && !hasRole(user.roles, 'admin')) {
      return badRequest('Only the person who submitted this application can withdraw it', 403)
    }
    await db
      .update(applicationDocument)
      .set({ status: 'draft', assignedApproverId: null })
      .where(eq(applicationDocument.id, doc.id))
    await notify(db, doc.assignedApproverId, 'approval_withdrawn', {
      documentRef: doc.documentRef,
      eventId: ev.id,
      by: user.name || user.email,
    })
    await logAudit(db, {
      trialId: ev.trialId,
      role: 'trial',
      action: 'document.withdraw',
      entity: `document:${doc.id}`,
      summary: `${doc.documentRef} withdrawn from approval by ${user.name || user.email}`,
      documentVersion: doc.versionNumber,
    })
  }

  return GET(req, ctx)
}

/** Record that the approved document was printed (enables the audit trail for the print gate). */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const documentId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return badRequest('Unauthorized', 401)

  const [doc] = await db.select().from(applicationDocument).where(eq(applicationDocument.id, documentId))
  if (!doc) return badRequest('Document not found', 404)
  if (doc.status !== 'approved') {
    return badRequest('Only an approved document can be printed as the approved weigh sheet', 409)
  }
  const [ev] = await db.select().from(applicationEvent).where(eq(applicationEvent.id, doc.eventId))

  await db
    .update(applicationDocument)
    .set({ printedAt: new Date() })
    .where(eq(applicationDocument.id, doc.id))
  await logAudit(db, {
    trialId: ev?.trialId,
    role: 'trial',
    action: 'document.print',
    entity: `document:${doc.id}`,
    summary: `Approved application document ${doc.documentRef} printed by ${user.name || user.email}`,
    documentVersion: doc.versionNumber,
  })

  const snapshot = doc.snapshotJson as DocumentSnapshot
  return NextResponse.json({ ok: true, documentRef: doc.documentRef, snapshot })
}
