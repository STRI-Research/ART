import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { trial, treatmentComponent, eventOccurrence } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getTrialSnapshot } from '@/lib/trialSnapshot'
import { findOrCreateEventAtDate } from '@/lib/planStore'
import { logAudit } from '@/lib/audit'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function badRequest(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

/** Add a manual occurrence: a component sprayed on a chosen date, outside its rule. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const trialId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return badRequest('Unauthorized', 401)

  const [tr] = await db.select().from(trial).where(eq(trial.id, trialId))
  if (!tr) return badRequest('Trial not found', 404)

  const body = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      componentId: z.number().int(),
    })
    .safeParse(await req.json().catch(() => ({})))
  if (!body.success) return badRequest(body.error.message)

  const [comp] = await db
    .select()
    .from(treatmentComponent)
    .where(eq(treatmentComponent.id, body.data.componentId))
  if (!comp) return badRequest('Component not found', 404)

  let label = ''
  await db.transaction(async (tx) => {
    const ev = await findOrCreateEventAtDate(tx, trialId, body.data.date, 'manual')
    label = ev.label
    await tx.insert(eventOccurrence).values({
      eventId: ev.id,
      componentId: comp.id,
      treatmentId: comp.treatmentId,
      origin: 'manual',
    })
  })

  await logAudit(db, {
    trialId,
    role: 'trial',
    action: 'occurrence.manual.add',
    entity: `trial:${trialId}`,
    summary: `Added a manual product line to application ${label} (${body.data.date})`,
    detail: { componentId: comp.id, date: body.data.date },
  })

  return NextResponse.json(await getTrialSnapshot(db, trialId))
}
