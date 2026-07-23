import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { applicationEvent } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { documentsAwaiting } from '@/lib/documents'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

/** Application documents awaiting the signed-in user's approval. */
export async function GET() {
  const db = getDb()
  const me = await getSessionUser(db)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const docs = await documentsAwaiting(db, me.id)
  const withEvents = await Promise.all(
    docs.map(async (d) => {
      const [ev] = await db.select().from(applicationEvent).where(eq(applicationEvent.id, d.eventId))
      return {
        id: d.id,
        documentRef: d.documentRef,
        versionNumber: d.versionNumber,
        createdAt: d.createdAt,
        trialId: ev?.trialId ?? null,
        eventLabel: ev?.label ?? '',
        plannedDate: ev?.plannedDate ?? '',
      }
    })
  )
  return NextResponse.json(withEvents)
}
