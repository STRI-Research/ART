import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { applicationEvent, trial } from '@/lib/db/schema'
import { and, eq, ne } from 'drizzle-orm'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

/**
 * Outstanding actions across all trials: completed applications whose signed documentary
 * evidence has not been uploaded (an application is not fully complete until both the digital
 * completion details and the signed evidence exist — brief §23).
 */
export async function GET() {
  const db = getDb()
  const me = await getSessionUser(db)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db
    .select({
      eventId: applicationEvent.id,
      trialId: applicationEvent.trialId,
      label: applicationEvent.label,
      actualDate: applicationEvent.actualDate,
      siteName: trial.siteName,
    })
    .from(applicationEvent)
    .innerJoin(trial, eq(applicationEvent.trialId, trial.id))
    .where(
      and(
        ne(applicationEvent.executionStatus, 'pending'),
        eq(applicationEvent.evidenceStatus, 'outstanding')
      )
    )

  const today = new Date().toISOString().slice(0, 10)
  const daysBetween = (a: string, b: string): number | null => {
    const t1 = new Date(a + 'T00:00:00Z').getTime()
    const t2 = new Date(b + 'T00:00:00Z').getTime()
    if (Number.isNaN(t1) || Number.isNaN(t2)) return null
    return Math.round((t2 - t1) / 86_400_000)
  }

  return NextResponse.json(
    rows
      .map((r) => ({ ...r, daysOutstanding: r.actualDate ? daysBetween(r.actualDate, today) : null }))
      .sort((a, b) => (b.daysOutstanding ?? 0) - (a.daysOutstanding ?? 0))
  )
}
