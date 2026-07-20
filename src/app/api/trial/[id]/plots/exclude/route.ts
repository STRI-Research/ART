import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { trial, plot, auditLog } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getTrialSnapshot } from '@/lib/trialSnapshot'
import { getActor } from '@/lib/actor'

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

  try {
    const actor = await getActor()
    await db.insert(auditLog).values({
      trialId,
      role: 'trial',
      actor,
      action: excluded ? 'plot.exclude' : 'plot.include',
      entity: `plot:${p.id}`,
      summary: excluded
        ? `Excluded plot #${p.plotNumber} — reason: ${reason}`
        : `Re-included plot #${p.plotNumber}`,
      detail: JSON.stringify({ plotId: p.id, plotNumber: p.plotNumber, excluded, reason }),
    })
  } catch {}

  return NextResponse.json(await getTrialSnapshot(db, trialId))
}
