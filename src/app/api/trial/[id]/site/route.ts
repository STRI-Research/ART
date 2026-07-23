import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { trial, auditLog } from '@/lib/db/schema'
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

  await db
    .update(trial)
    .set({
      siteName: body.siteName ?? tr.siteName,
      operator: body.operator ?? tr.operator,
      location: body.location ?? tr.location,
      city: body.city ?? tr.city,
      state: body.state ?? tr.state,
      country: body.country ?? tr.country,
      plantingDate: body.plantingDate ?? tr.plantingDate,
      trialNotes: body.trialNotes ?? tr.trialNotes,
      startDate: body.startDate ?? tr.startDate,
      endDate: body.endDate ?? tr.endDate,
      fundedApplicationCount:
        body.fundedApplicationCount !== undefined ? body.fundedApplicationCount : tr.fundedApplicationCount,
      updatedAt: new Date(),
    })
    .where(eq(trial.id, trialId))

  try {
    const actor = await getActor()
    const fields = ['siteName','operator','location','city','state','country','plantingDate','trialNotes','startDate','endDate','fundedApplicationCount']
    const changed = fields.filter((f) => body[f] !== undefined && body[f] !== (tr as Record<string, unknown>)[f])
    await db.insert(auditLog).values({
      trialId,
      role: 'trial',
      actor,
      action: 'trial.site.edit',
      entity: `trial:${trialId}`,
      summary: `Edited trial site info — changed ${changed.length ? changed.join(', ') : 'fields'}`,
      detail: JSON.stringify({ changed }),
    })
  } catch {}

  return NextResponse.json(await getTrialSnapshot(db, trialId))
}
