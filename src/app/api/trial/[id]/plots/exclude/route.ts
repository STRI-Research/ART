import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { trial, plot } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getTrialSnapshot } from '@/lib/trialSnapshot'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()
  const trialId = Number(id)

  const [tr] = await db.select().from(trial).where(eq(trial.id, trialId))
  if (!tr) return badRequest('Trial not found')

  const body = await req.json()
  const excluded = !!body.excluded
  const reason = excluded ? String(body.reason ?? '').trim() : ''
  if (excluded && !reason) return badRequest('A reason is required to exclude a plot.')

  const [p] = await db.select().from(plot).where(eq(plot.id, Number(body.plotId)))
  if (!p || p.trialId !== trialId) return badRequest('Plot not found')

  await db.update(plot).set({ excluded, excludeReason: reason }).where(eq(plot.id, p.id))

  return NextResponse.json(await getTrialSnapshot(db, trialId))
}
