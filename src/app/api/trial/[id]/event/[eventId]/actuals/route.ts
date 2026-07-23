import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { applicationEvent, eventOccurrence } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getTrialSnapshot } from '@/lib/trialSnapshot'
import { logAudit } from '@/lib/audit'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; eventId: string }> }

function badRequest(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

/**
 * Amend a completed application's actual details, or record actual rates that differed from
 * the approved plan. Completed records are protected: every amendment requires a reason and is
 * written to the audit log with the previous and new values — prior history is never erased.
 * Actual/deviation details are non-material and never invalidate the pre-application approval.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id, eventId } = await ctx.params
  const trialId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return badRequest('Unauthorized', 401)

  const [ev] = await db
    .select()
    .from(applicationEvent)
    .where(and(eq(applicationEvent.id, Number(eventId)), eq(applicationEvent.trialId, trialId)))
  if (!ev) return badRequest('Event not found', 404)
  if (ev.executionStatus === 'pending') {
    return badRequest('This application has not been completed yet', 409)
  }

  const body = z
    .object({
      actualDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      actualStartTime: z.string().optional(),
      actualEndTime: z.string().optional(),
      operator: z.string().optional(),
      sprayer: z.string().optional(),
      completionNotes: z.string().optional(),
      actualWeather: z.record(z.unknown()).optional(),
      preChecks: z.record(z.unknown()).optional(),
      reason: z.string(),
      occurrenceActuals: z
        .array(
          z.object({
            id: z.number().int(),
            actualRateValue: z.number().positive().nullable(),
            actualRateUnit: z.string().default(''),
            deviationReason: z.string().default(''),
          })
        )
        .optional(),
    })
    .safeParse(await req.json().catch(() => ({})))
  if (!body.success) return badRequest(body.error.message)
  const p = body.data
  if (!p.reason.trim()) return badRequest('A reason is required to amend a completed application record')

  const eventFields = [
    'actualDate',
    'actualStartTime',
    'actualEndTime',
    'operator',
    'sprayer',
    'completionNotes',
  ] as const
  const changedFields = eventFields.filter((f) => p[f] !== undefined && p[f] !== ev[f])

  // Actual rates that differ from plan require a deviation reason (brief §18/§22).
  for (const oa of p.occurrenceActuals ?? []) {
    if (oa.actualRateValue != null && !oa.deviationReason.trim()) {
      const [occ] = await db.select().from(eventOccurrence).where(eq(eventOccurrence.id, oa.id))
      if (occ && occ.plannedRateValue !== oa.actualRateValue) {
        return badRequest('A deviation reason is required when the actual rate differs from the plan')
      }
    }
  }

  await db.transaction(async (tx) => {
    if (changedFields.length || p.actualWeather !== undefined || p.preChecks !== undefined) {
      await tx
        .update(applicationEvent)
        .set({
          actualDate: p.actualDate ?? ev.actualDate,
          actualStartTime: p.actualStartTime ?? ev.actualStartTime,
          actualEndTime: p.actualEndTime ?? ev.actualEndTime,
          operator: p.operator ?? ev.operator,
          sprayer: p.sprayer ?? ev.sprayer,
          completionNotes: p.completionNotes ?? ev.completionNotes,
          actualWeather: p.actualWeather !== undefined ? p.actualWeather : ev.actualWeather,
          preChecks: p.preChecks !== undefined ? p.preChecks : ev.preChecks,
          executionStatus: 'amended',
          amendReason: p.reason,
          version: ev.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(applicationEvent.id, ev.id))
    }

    for (const oa of p.occurrenceActuals ?? []) {
      const [occ] = await tx.select().from(eventOccurrence).where(eq(eventOccurrence.id, oa.id))
      if (!occ || occ.eventId !== ev.id) continue
      await tx
        .update(eventOccurrence)
        .set({
          actualRateValue: oa.actualRateValue,
          actualRateUnit: oa.actualRateUnit,
          deviationReason: oa.deviationReason,
        })
        .where(eq(eventOccurrence.id, oa.id))
      await logAudit(db, {
        trialId,
        role: 'trial',
        action: 'actual.rate.deviation',
        entity: `occurrence:${oa.id}`,
        summary: `Recorded actual rate ${oa.actualRateValue ?? '—'} ${oa.actualRateUnit} (planned ${occ.plannedRateValue ?? 'default'}) in application ${ev.label}`,
        before: { actualRateValue: occ.actualRateValue },
        after: { actualRateValue: oa.actualRateValue },
        reason: oa.deviationReason || p.reason,
      })
    }
  })

  if (changedFields.length) {
    await logAudit(db, {
      trialId,
      role: 'trial',
      action: 'actual.amend',
      entity: `event:${ev.id}`,
      summary: `Amended completed application ${ev.label} — ${changedFields.join(', ')}`,
      before: Object.fromEntries(changedFields.map((f) => [f, ev[f]])),
      after: Object.fromEntries(changedFields.map((f) => [f, p[f]])),
      reason: p.reason,
    })
  }

  return NextResponse.json(await getTrialSnapshot(db, trialId))
}
