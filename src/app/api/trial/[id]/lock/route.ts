import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { trial, plot, auditLog } from '@/lib/db/schema'
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
  if (tr.layoutLockedAt) return badRequest('Layout is already locked')

  const plots = await db.select().from(plot).where(eq(plot.trialId, trialId))
  if (plots.length === 0) return badRequest('Generate a layout before locking it.')

  await db
    .update(trial)
    .set({ layoutLockedAt: new Date().toISOString(), updatedAt: new Date() })
    .where(eq(trial.id, trialId))

  try {
    await db.insert(auditLog).values({
      trialId,
      role: 'trial',
      actor: req.headers.get('x-vercel-user-email') ?? 'web',
      action: 'trial.layout.lock',
      entity: `trial:${trialId}`,
      summary: `Locked trial layout — ${plots.length} plots`,
      detail: JSON.stringify({ plotCount: plots.length }),
    })
  } catch {}

  return NextResponse.json(await getTrialSnapshot(db, trialId))
}
