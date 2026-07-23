import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { applicationEvent, treatment, treatmentMix } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getTrialSnapshot } from '@/lib/trialSnapshot'
import { logAudit } from '@/lib/audit'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; eventId: string; treatmentId: string }> }

function badRequest(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

/**
 * Upsert the spray-mix settings for one treatment within one event: shared water volume,
 * overage, water-in, sprayer, and the tank-mix compatibility record (compatibility is a
 * recorded decision, never assumed from sharing a date).
 */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id, eventId, treatmentId } = await ctx.params
  const trialId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return badRequest('Unauthorized', 401)

  const [ev] = await db
    .select()
    .from(applicationEvent)
    .where(and(eq(applicationEvent.id, Number(eventId)), eq(applicationEvent.trialId, trialId)))
  if (!ev) return badRequest('Event not found', 404)
  if (ev.executionStatus !== 'pending') {
    return badRequest('This application is completed — its mix settings are fixed', 409)
  }

  const [trt] = await db.select().from(treatment).where(eq(treatment.id, Number(treatmentId)))
  if (!trt) return badRequest('Treatment not found', 404)

  const body = z
    .object({
      waterVolumeLPerHa: z.number().positive().nullable().optional(),
      overageEnabled: z.boolean().optional(),
      overagePct: z.number().min(0).max(100).optional(),
      waterIn: z.boolean().optional(),
      sprayer: z.string().optional(),
      tankMixStatus: z.enum(['unconfirmed', 'confirmed', 'separate', 'not_confirmed']).optional(),
      tankMixNotes: z.string().optional(),
    })
    .safeParse(await req.json().catch(() => ({})))
  if (!body.success) return badRequest(body.error.message)
  const p = body.data

  const [existing] = await db
    .select()
    .from(treatmentMix)
    .where(and(eq(treatmentMix.eventId, ev.id), eq(treatmentMix.treatmentId, trt.id)))

  const values = {
    waterVolumeLPerHa:
      p.waterVolumeLPerHa !== undefined ? p.waterVolumeLPerHa : (existing?.waterVolumeLPerHa ?? null),
    overageEnabled: p.overageEnabled ?? existing?.overageEnabled ?? false,
    overagePct: p.overagePct ?? existing?.overagePct ?? 0,
    waterIn: p.waterIn ?? existing?.waterIn ?? false,
    sprayer: p.sprayer ?? existing?.sprayer ?? '',
    tankMixStatus: p.tankMixStatus ?? existing?.tankMixStatus ?? 'unconfirmed',
    tankMixNotes: p.tankMixNotes ?? existing?.tankMixNotes ?? '',
  }

  if (existing) {
    await db.update(treatmentMix).set(values).where(eq(treatmentMix.id, existing.id))
  } else {
    await db.insert(treatmentMix).values({ eventId: ev.id, treatmentId: trt.id, ...values })
  }

  const changed = Object.keys(p)
  await logAudit(db, {
    trialId,
    role: 'trial',
    action: p.tankMixStatus !== undefined ? 'mix.tankmix.status' : 'mix.settings.change',
    entity: `event:${ev.id}:treatment:${trt.id}`,
    summary: `Updated T${trt.number} mix in application ${ev.label} — ${changed.join(', ')}`,
    before: existing
      ? Object.fromEntries(changed.map((k) => [k, (existing as Record<string, unknown>)[k]]))
      : undefined,
    after: Object.fromEntries(changed.map((k) => [k, (p as Record<string, unknown>)[k]])),
  })

  return NextResponse.json(await getTrialSnapshot(db, trialId))
}
