import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { trial, plot } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { getTrialSnapshot } from '@/lib/trialSnapshot'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

/** Re-lays out the physical grid (mapRow/mapCol) for a new column count, in plot-number order.
 *  Purely presentational — it never touches rep/block/treatment, so it can't affect analysis. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()
  const trialId = Number(id)

  const [tr] = await db.select().from(trial).where(eq(trial.id, trialId))
  if (!tr) return badRequest('Trial not found')
  if (tr.layoutLockedAt) return badRequest('Layout is locked')

  const plots = await db.select().from(plot).where(eq(plot.trialId, trialId)).orderBy(asc(plot.plotNumber))
  if (plots.length === 0) return badRequest('No layout to reshape')

  const body = await req.json()
  const cols = Math.max(1, Math.min(plots.length, Math.floor(Number(body.cols))))
  if (!Number.isFinite(cols) || cols < 1) return badRequest('Invalid column count')

  for (let i = 0; i < plots.length; i++) {
    await db
      .update(plot)
      .set({ mapRow: Math.floor(i / cols), mapCol: i % cols })
      .where(eq(plot.id, plots[i].id))
  }

  const plotRows = Math.ceil(plots.length / cols)
  await db.update(trial).set({ plotRows, plotCols: cols, updatedAt: new Date() }).where(eq(trial.id, trialId))

  return NextResponse.json(await getTrialSnapshot(db, trialId))
}
