import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { applicationEvent, eventOccurrence } from '@/lib/db/schema'
import { and, eq, gt } from 'drizzle-orm'
import { z } from 'zod'
import { rebaseDelta, shiftDate } from '@shared/plan'
import { getTrialSnapshot } from '@/lib/trialSnapshot'
import { moveOccurrencesToDate } from '@/lib/planStore'
import { logAudit } from '@/lib/audit'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function badRequest(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

/**
 * Edit one component occurrence: a planned-rate override (this occurrence only, brief §13),
 * cancellation, or a date move. Editing an individual occurrence proposes changing that
 * component's schedule (brief §12): `rebaseComponent: true` delta-shifts the same component's
 * later pending occurrences too; the default moves this occurrence only.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const occurrenceId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return badRequest('Unauthorized', 401)

  const [occ] = await db.select().from(eventOccurrence).where(eq(eventOccurrence.id, occurrenceId))
  if (!occ) return badRequest('Occurrence not found', 404)
  const [ev] = await db.select().from(applicationEvent).where(eq(applicationEvent.id, occ.eventId))
  if (!ev) return badRequest('Event not found', 404)
  const trialId = ev.trialId

  if (ev.executionStatus !== 'pending') {
    return badRequest('This application is completed — its lines cannot be changed here', 409)
  }

  const body = z
    .object({
      plannedRateValue: z.number().positive().nullable().optional(),
      plannedRateUnit: z.string().optional(),
      plannedOverrideReason: z.string().optional(),
      cancel: z.boolean().optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      rebaseComponent: z.boolean().default(false),
      reason: z.string().default(''),
    })
    .safeParse(await req.json().catch(() => ({})))
  if (!body.success) return badRequest(body.error.message)
  const p = body.data

  // Rate override / cancel — simple field updates on this occurrence only.
  if (p.plannedRateValue !== undefined || p.plannedRateUnit !== undefined || p.cancel !== undefined) {
    if (p.plannedRateValue !== undefined && p.plannedRateValue !== null && !p.plannedOverrideReason?.trim() && !occ.plannedOverrideReason) {
      return badRequest('A reason is required when overriding the planned rate')
    }
    await db
      .update(eventOccurrence)
      .set({
        plannedRateValue: p.plannedRateValue !== undefined ? p.plannedRateValue : occ.plannedRateValue,
        plannedRateUnit: p.plannedRateUnit ?? occ.plannedRateUnit,
        plannedOverrideReason: p.plannedOverrideReason ?? occ.plannedOverrideReason,
        status: p.cancel === undefined ? occ.status : p.cancel ? 'cancelled' : 'planned',
      })
      .where(eq(eventOccurrence.id, occurrenceId))
    await logAudit(db, {
      trialId,
      role: 'trial',
      action: p.cancel !== undefined ? 'occurrence.cancel' : 'occurrence.rate.override',
      entity: `occurrence:${occurrenceId}`,
      summary:
        p.cancel !== undefined
          ? `${p.cancel ? 'Cancelled' : 'Restored'} a product line in application ${ev.label}`
          : `Overrode planned rate in application ${ev.label} → ${p.plannedRateValue ?? 'default'} ${p.plannedRateUnit ?? occ.plannedRateUnit}`,
      before: { plannedRateValue: occ.plannedRateValue, status: occ.status },
      after: { plannedRateValue: p.plannedRateValue, cancel: p.cancel },
      reason: p.plannedOverrideReason || p.reason || undefined,
    })
    return NextResponse.json(await getTrialSnapshot(db, trialId))
  }

  // Date move (this occurrence, optionally rebasing the component's later occurrences).
  if (!p.date) return badRequest('Nothing to update')
  const delta = rebaseDelta(ev.plannedDate, p.date)
  const rebased: { occurrenceId: number; from: string; to: string }[] = []

  await db.transaction(async (tx) => {
    await moveOccurrencesToDate(tx, trialId, [occurrenceId], p.date!, 'split')

    if (p.rebaseComponent && delta != null && delta !== 0) {
      // Later pending occurrences of the same component, each shifted by the same delta.
      const later = await tx
        .select({
          occurrenceId: eventOccurrence.id,
          eventDate: applicationEvent.plannedDate,
        })
        .from(eventOccurrence)
        .innerJoin(applicationEvent, eq(eventOccurrence.eventId, applicationEvent.id))
        .where(
          and(
            eq(eventOccurrence.componentId, occ.componentId),
            eq(applicationEvent.trialId, trialId),
            eq(applicationEvent.executionStatus, 'pending'),
            eq(applicationEvent.planningStatus, 'planned'),
            gt(applicationEvent.plannedDate, ev.plannedDate)
          )
        )
      for (const l of later) {
        if (l.occurrenceId === occurrenceId) continue
        const to = shiftDate(l.eventDate, delta)
        if (!to) continue
        rebased.push({ occurrenceId: l.occurrenceId, from: l.eventDate, to })
        await moveOccurrencesToDate(tx, trialId, [l.occurrenceId], to, 'split')
      }
    }
  })

  await logAudit(db, {
    trialId,
    role: 'trial',
    action: p.rebaseComponent ? 'component.rebase' : 'occurrence.move',
    entity: `occurrence:${occurrenceId}`,
    summary: p.rebaseComponent
      ? `Moved a product line ${ev.plannedDate} → ${p.date} and rebased ${rebased.length} later occurrence(s) by ${delta} day(s)`
      : `Moved a product line from application ${ev.label} (${ev.plannedDate}) to ${p.date}`,
    before: { date: ev.plannedDate },
    after: { date: p.date, rebased },
    reason: p.reason,
  })

  return NextResponse.json(await getTrialSnapshot(db, trialId))
}
