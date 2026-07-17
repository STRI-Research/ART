import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { trial, plot } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getTrialSnapshot } from '@/lib/trialSnapshot'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

/** Drag-and-drop rearrange: moves a plot to an empty cell, or swaps positions (not treatments)
 *  with whatever plot already occupies the target cell. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()
  const trialId = Number(id)

  const [tr] = await db.select().from(trial).where(eq(trial.id, trialId))
  if (!tr) return badRequest('Trial not found')
  if (tr.layoutLockedAt) return badRequest('Layout is locked')

  const body = await req.json()
  const mapRow = Number(body.mapRow)
  const mapCol = Number(body.mapCol)

  const [p] = await db.select().from(plot).where(eq(plot.id, Number(body.plotId)))
  if (!p || p.trialId !== trialId) return badRequest('Plot not found')

  const [occupant] = await db
    .select()
    .from(plot)
    .where(and(eq(plot.trialId, trialId), eq(plot.mapRow, mapRow), eq(plot.mapCol, mapCol)))

  if (occupant && occupant.id !== p.id) {
    await db.update(plot).set({ mapRow: p.mapRow, mapCol: p.mapCol }).where(eq(plot.id, occupant.id))
  }
  await db.update(plot).set({ mapRow, mapCol }).where(eq(plot.id, p.id))

  return NextResponse.json(await getTrialSnapshot(db, trialId))
}
