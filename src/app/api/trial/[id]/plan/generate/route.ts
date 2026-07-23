import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { trial, applicationEvent, eventOccurrence, treatmentComponent, treatment } from '@/lib/db/schema'
import { asc, eq, inArray } from 'drizzle-orm'
import { generatePlan, planRegeneration, detectFundedConflict } from '@shared/plan'
import { getTrialSnapshot } from '@/lib/trialSnapshot'
import { nextSequence } from '@/lib/planStore'
import { logAudit } from '@/lib/audit'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

/**
 * Generate (or regenerate) the trial's application plan from the protocol's component
 * scheduling rules. Completed events are never touched; pending generated events are replaced.
 * Never silently resolves a funded-count conflict — it is returned for the user to act on.
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const trialId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [tr] = await db.select().from(trial).where(eq(trial.id, trialId))
  if (!tr) return badRequest('Trial not found')
  if (!tr.startDate || !tr.endDate) {
    return badRequest('Set the trial start and finish dates before generating a schedule')
  }
  if (tr.endDate < tr.startDate) return badRequest('Trial finish date is before the start date')

  const trts = await db
    .select({ id: treatment.id })
    .from(treatment)
    .where(eq(treatment.protocolId, tr.protocolId))
  const trtIds = trts.map((t) => t.id)
  const components = trtIds.length
    ? await db
        .select()
        .from(treatmentComponent)
        .where(inArray(treatmentComponent.treatmentId, trtIds))
        .orderBy(asc(treatmentComponent.ordinal))
    : []
  if (!components.length) {
    return badRequest('No treatment components defined — build the treatment programmes first')
  }

  const generated = generatePlan(
    components.map((c) => ({
      id: c.id,
      treatmentId: c.treatmentId,
      scheduleRule: c.scheduleRule,
      activeFrom: c.activeFrom,
      activeUntil: c.activeUntil,
      maxOccurrences: c.maxOccurrences,
      fromOccurrence: c.fromOccurrence,
    })),
    tr.startDate,
    tr.endDate
  )

  const existing = await db
    .select({
      id: applicationEvent.id,
      label: applicationEvent.label,
      plannedDate: applicationEvent.plannedDate,
      executionStatus: applicationEvent.executionStatus,
      planningStatus: applicationEvent.planningStatus,
    })
    .from(applicationEvent)
    .where(eq(applicationEvent.trialId, trialId))

  const regen = planRegeneration(existing, generated)

  await db.transaction(async (tx) => {
    if (regen.deleteEventIds.length) {
      await tx.delete(applicationEvent).where(inArray(applicationEvent.id, regen.deleteEventIds))
    }
    // planRegeneration assigned labels that avoid kept (completed/cancelled) events' labels.
    let seq = await nextSequence(tx, trialId)
    for (const ev of regen.createEvents) {
      const [created] = await tx
        .insert(applicationEvent)
        .values({
          trialId,
          sequence: seq++,
          label: ev.label,
          plannedDate: ev.plannedDate,
          decisionRequired: ev.decisionRequired,
          createdFrom: 'generated',
        })
        .returning()
      if (ev.occurrences.length) {
        await tx.insert(eventOccurrence).values(
          ev.occurrences.map((o) => ({
            eventId: created.id,
            componentId: o.componentId,
            treatmentId: o.treatmentId,
            origin: 'rule' as const,
          }))
        )
      }
    }
  })

  const conflict = detectFundedConflict(
    generated,
    tr.fundedApplicationCount,
    tr.startDate,
    tr.endDate
  )

  await logAudit(db, {
    trialId,
    role: 'trial',
    action: 'trial.schedule.generate',
    entity: `trial:${trialId}`,
    summary: `Generated application schedule — ${regen.createEvents.length} event(s) created, ${regen.deleteEventIds.length} pending replaced, ${regen.keptEventIds.length} kept`,
    detail: {
      created: regen.createEvents.length,
      replaced: regen.deleteEventIds.length,
      kept: regen.keptEventIds.length,
      window: { start: tr.startDate, end: tr.endDate },
      conflict,
    },
  })

  return NextResponse.json({ snapshot: await getTrialSnapshot(db, trialId), conflict })
}
