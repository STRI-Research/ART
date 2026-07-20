import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { trial, applicationActual, auditLog } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getTrialSnapshot } from '@/lib/trialSnapshot'
import { getActor } from '@/lib/actor'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()
  const trialId = Number(id)

  const [tr] = await db.select().from(trial).where(eq(trial.id, trialId))
  if (!tr) return badRequest('Trial not found')

  const body = await req.json()
  const list: { timingCode?: string; actualDate?: string }[] = Array.isArray(body) ? body : []

  await db.delete(applicationActual).where(eq(applicationActual.trialId, trialId))

  const rows = list
    .filter((a) => (a.timingCode ?? '').trim())
    .map((a) => ({ trialId, timingCode: a.timingCode!, actualDate: a.actualDate ?? '' }))
  if (rows.length > 0) await db.insert(applicationActual).values(rows)

  try {
    const actor = await getActor()
    const codes = rows.map((r) => r.timingCode)
    await db.insert(auditLog).values({
      trialId,
      role: 'trial',
      actor,
      action: 'application.actuals',
      entity: `trial:${trialId}`,
      summary: `Saved application actuals — ${rows.length} timing(s): ${codes.join(', ') || '(none)'}`,
      detail: JSON.stringify({ count: rows.length, timingCodes: codes }),
    })
  } catch {}

  return NextResponse.json(await getTrialSnapshot(db, trialId))
}
