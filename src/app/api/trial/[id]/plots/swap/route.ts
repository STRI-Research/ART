import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { trial, protocol, plot, auditLog } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getTrialSnapshot } from '@/lib/trialSnapshot'
import { canSwapTreatments } from '@shared/design'
import type { DesignType } from '@shared/types'

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
  if (tr.layoutLockedAt) return badRequest('Layout is locked')

  const [proto] = await db.select().from(protocol).where(eq(protocol.id, tr.protocolId))
  if (!proto) return badRequest('Protocol not found')

  const body = await req.json()
  const [a] = await db.select().from(plot).where(eq(plot.id, Number(body.plotIdA)))
  const [b] = await db.select().from(plot).where(eq(plot.id, Number(body.plotIdB)))
  if (!a || !b || a.trialId !== trialId || b.trialId !== trialId) return badRequest('Plot not found')

  if (!canSwapTreatments(proto.design as DesignType, a, b)) {
    return badRequest('Treatments can only be swapped within the same block/rep — that would change the design.')
  }

  await db.update(plot).set({ treatmentId: b.treatmentId }).where(eq(plot.id, a.id))
  await db.update(plot).set({ treatmentId: a.treatmentId }).where(eq(plot.id, b.id))

  try {
    await db.insert(auditLog).values({
      trialId,
      role: 'trial',
      actor: req.headers.get('x-vercel-user-email') ?? 'web',
      action: 'plot.swap',
      entity: `trial:${trialId}`,
      summary: `Swapped treatments between plot #${a.plotNumber} and plot #${b.plotNumber}`,
      detail: JSON.stringify({ plotIdA: a.id, plotNumberA: a.plotNumber, plotIdB: b.id, plotNumberB: b.plotNumber }),
    })
  } catch {}

  return NextResponse.json(await getTrialSnapshot(db, trialId))
}
