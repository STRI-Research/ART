import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { applicationDocument, applicationEvent, trial, evidenceFile } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ ref: string }> }

/**
 * Resolve a printed document reference (the QR target) to its application record — the
 * QR opens the exact event's evidence-upload page; ART never tries to detect QR codes inside
 * uploaded photos.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { ref } = await ctx.params
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [doc] = await db
    .select()
    .from(applicationDocument)
    .where(eq(applicationDocument.documentRef, decodeURIComponent(ref)))
  if (!doc) return NextResponse.json({ error: 'Unknown document reference' }, { status: 404 })

  const [ev] = await db.select().from(applicationEvent).where(eq(applicationEvent.id, doc.eventId))
  if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  const [tr] = await db.select().from(trial).where(eq(trial.id, ev.trialId))

  const evidence = await db
    .select()
    .from(evidenceFile)
    .where(eq(evidenceFile.eventId, ev.id))
    .orderBy(desc(evidenceFile.uploadedAt))

  return NextResponse.json({
    documentRef: doc.documentRef,
    documentVersion: doc.versionNumber,
    documentStatus: doc.status,
    trialId: ev.trialId,
    siteName: tr?.siteName ?? '',
    event: {
      id: ev.id,
      label: ev.label,
      plannedDate: ev.plannedDate,
      actualDate: ev.actualDate,
      executionStatus: ev.executionStatus,
      evidenceStatus: ev.evidenceStatus,
    },
    evidence,
  })
}
