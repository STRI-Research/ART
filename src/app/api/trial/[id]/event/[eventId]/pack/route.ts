import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { applicationEvent } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { latestDocument, buildSnapshot, userById } from '@/lib/documents'
import type { DocumentSnapshot } from '@shared/approval'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; eventId: string }> }

/**
 * Everything the application pack needs for one event. When the latest document version is
 * approved, the pack renders from that version's immutable snapshot; otherwise a live snapshot
 * is built and the pack renders as a watermarked draft.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id, eventId } = await ctx.params
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [ev] = await db
    .select()
    .from(applicationEvent)
    .where(and(eq(applicationEvent.id, Number(eventId)), eq(applicationEvent.trialId, Number(id))))
  if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const doc = await latestDocument(db, ev.id)
  const approved = doc?.status === 'approved'
  const snapshot = approved ? (doc!.snapshotJson as DocumentSnapshot) : await buildSnapshot(db, ev.id)
  if (!snapshot) return NextResponse.json({ error: 'Could not build snapshot' }, { status: 500 })

  const [firstChecker, approver, approvedBy] = doc
    ? await Promise.all([
        userById(db, doc.firstCheckById),
        userById(db, doc.assignedApproverId),
        userById(db, doc.approvedById),
      ])
    : [null, null, null]

  return NextResponse.json({
    mode: approved ? 'approved' : 'draft',
    snapshot,
    event: {
      id: ev.id,
      label: ev.label,
      plannedDate: ev.plannedDate,
      actualDate: ev.actualDate,
      executionStatus: ev.executionStatus,
    },
    document: doc
      ? {
          id: doc.id,
          versionNumber: doc.versionNumber,
          status: doc.status,
          documentRef: doc.documentRef,
          createdAt: doc.createdAt,
          firstCheckerName: firstChecker?.name ?? firstChecker?.email ?? '',
          firstCheckAt: doc.firstCheckAt,
          approverName: approver?.name ?? approver?.email ?? '',
          approvedByName: approvedBy?.name ?? approvedBy?.email ?? '',
          approvedAt: doc.approvedAt,
        }
      : null,
  })
}
