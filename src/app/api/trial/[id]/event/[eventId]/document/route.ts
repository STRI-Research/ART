import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { applicationEvent, applicationDocument } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { latestDocument, createDocumentVersion, notify, userById, hashSnapshot, buildSnapshot } from '@/lib/documents'
import { logAudit } from '@/lib/audit'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; eventId: string }> }

function badRequest(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

/** The latest document version for this event (with snapshot), if any. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id, eventId } = await ctx.params
  const db = getDb()
  const [ev] = await db
    .select()
    .from(applicationEvent)
    .where(and(eq(applicationEvent.id, Number(eventId)), eq(applicationEvent.trialId, Number(id))))
  if (!ev) return badRequest('Event not found', 404)
  const doc = await latestDocument(db, ev.id)
  if (!doc) return NextResponse.json(null)
  const [firstChecker, approver] = await Promise.all([
    userById(db, doc.firstCheckById),
    userById(db, doc.assignedApproverId),
  ])
  const approvedBy = await userById(db, doc.approvedById)
  return NextResponse.json({
    ...doc,
    firstCheckerName: firstChecker?.name ?? firstChecker?.email ?? '',
    approverName: approver?.name ?? approver?.email ?? '',
    approvedByName: approvedBy?.name ?? approvedBy?.email ?? '',
  })
}

/**
 * Complete the first check and submit for Research-Manager approval (brief §18): builds a
 * fresh immutable snapshot version from live data, records the first checker's server-side
 * Entra identity, assigns the chosen approver, and notifies them.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id, eventId } = await ctx.params
  const trialId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return badRequest('Unauthorized', 401)

  const [ev] = await db
    .select()
    .from(applicationEvent)
    .where(and(eq(applicationEvent.id, Number(eventId)), eq(applicationEvent.trialId, trialId)))
  if (!ev) return badRequest('Event not found', 404)
  if (ev.planningStatus === 'cancelled') return badRequest('Event is cancelled', 409)
  if (ev.executionStatus !== 'pending') return badRequest('Application is already completed', 409)

  const body = z
    .object({ approverId: z.number().int(), comments: z.string().default('') })
    .safeParse(await req.json().catch(() => ({})))
  if (!body.success) return badRequest(body.error.message)

  const approver = await userById(db, body.data.approverId)
  if (!approver) return badRequest('Approver not found')
  if (approver.id === user.id) {
    return badRequest('The Research Manager approver must be a different person than the first checker', 409)
  }

  // A live re-check: an existing awaiting/approved version with the same inputs blocks a
  // duplicate submission; a differing one is superseded by the new version below.
  const existing = await latestDocument(db, ev.id)
  if (existing && (existing.status === 'awaiting_approval' || existing.status === 'approved')) {
    const snapshot = await buildSnapshot(db, ev.id)
    if (snapshot && hashSnapshot(snapshot) === existing.inputHash) {
      return badRequest(
        existing.status === 'approved'
          ? 'This application version is already approved'
          : 'This application version is already awaiting approval',
        409
      )
    }
    await db
      .update(applicationDocument)
      .set({ status: 'superseded', supersededAt: new Date() })
      .where(eq(applicationDocument.id, existing.id))
  }

  const now = new Date()
  let docId = 0
  let docRef = ''
  let version = 0
  await db.transaction(async (tx) => {
    const doc = await createDocumentVersion(tx, ev.id, trialId, ev.label, user.id)
    await tx
      .update(applicationDocument)
      .set({
        status: 'awaiting_approval',
        firstCheckById: user.id,
        firstCheckAt: now,
        assignedApproverId: approver.id,
        comments: body.data.comments,
      })
      .where(eq(applicationDocument.id, doc.id))
    await notify(tx, approver.id, 'approval_requested', {
      documentRef: doc.documentRef,
      trialId,
      eventId: ev.id,
      eventLabel: ev.label,
      plannedDate: ev.plannedDate,
      from: user.name || user.email,
    })
    docId = doc.id
    docRef = doc.documentRef
    version = doc.versionNumber
  })

  await logAudit(db, {
    trialId,
    role: 'trial',
    action: 'document.submit',
    entity: `document:${docId}`,
    summary: `First check completed for application ${ev.label} (${docRef}) — submitted to ${approver.name || approver.email} for approval`,
    documentVersion: version,
    detail: { approverId: approver.id, comments: body.data.comments },
  })

  return GET(req, ctx)
}
