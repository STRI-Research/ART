import { eq, asc, inArray } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import {
  trial,
  protocol,
  application,
  measurementDef,
  plot,
  measurementHeader,
  measurementValue,
  applicationActual,
  property,
} from '@/lib/db/schema'
import { loadTreatments } from '@/lib/treatments'
import { loadPlan } from '@/lib/planStore'

type Db = ReturnType<typeof getDb>

/** Everything a trial view needs in one round trip: the trial, its protocol, and every
 *  trial-side record. Mirrors the Electron app's ProjectSnapshot so ported components can
 *  keep the same shape after a fetch/mutation. */
export async function getTrialSnapshot(db: Db, trialId: number) {
  const [tr] = await db.select().from(trial).where(eq(trial.id, trialId))
  if (!tr) return null

  const [proto] = await db.select().from(protocol).where(eq(protocol.id, tr.protocolId))
  if (!proto) return null

  const treatments = await loadTreatments(db, proto.id)

  const applications = await db
    .select()
    .from(application)
    .where(eq(application.protocolId, proto.id))
    .orderBy(asc(application.ordinal))

  const measurementDefs = await db
    .select()
    .from(measurementDef)
    .where(eq(measurementDef.protocolId, proto.id))
    .orderBy(asc(measurementDef.ordinal))

  const plots = await db
    .select()
    .from(plot)
    .where(eq(plot.trialId, tr.id))
    .orderBy(asc(plot.plotNumber))

  const measurementHeaders = await db
    .select()
    .from(measurementHeader)
    .where(eq(measurementHeader.trialId, tr.id))
    .orderBy(asc(measurementHeader.ordinal))

  const headerIds = measurementHeaders.map((h) => h.id)
  const measurementValues =
    headerIds.length > 0
      ? await db
          .select()
          .from(measurementValue)
          .where(inArray(measurementValue.measurementHeaderId, headerIds))
      : []

  const applicationActuals = await db
    .select()
    .from(applicationActual)
    .where(eq(applicationActual.trialId, tr.id))

  const properties = await db
    .select()
    .from(property)
    .where(eq(property.trialId, tr.id))

  const {
    events: applicationEvents,
    occurrences: eventOccurrences,
    mixes: treatmentMixes,
  } = await loadPlan(db, tr.id)

  // DAT derivation reads applicationActuals (timingCode → actualDate). Completed application
  // events feed the same mechanism by label, so "14 DA-A" resolves against event A's actual
  // date without touching the timing module; explicit legacy actuals win on a code clash.
  const actualByCode = new Map(applicationActuals.map((a) => [a.timingCode, a]))
  const mergedActuals = [...applicationActuals]
  for (const ev of applicationEvents) {
    if (ev.executionStatus !== 'pending' && ev.actualDate && !actualByCode.has(ev.label)) {
      mergedActuals.push({
        id: -ev.id, // synthetic (not a DB row); consumers only read timingCode/actualDate
        trialId: tr.id,
        timingCode: ev.label,
        actualDate: ev.actualDate,
      })
    }
  }

  return {
    trial: tr,
    protocol: proto,
    treatments,
    applications,
    measurementDefs,
    plots,
    measurementHeaders,
    measurementValues,
    applicationActuals: mergedActuals,
    properties,
    applicationEvents,
    eventOccurrences,
    treatmentMixes,
  }
}
