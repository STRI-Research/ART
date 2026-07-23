import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import { applicationEvent, eventOccurrence, treatmentMix } from '@/lib/db/schema'
import { nextLabels } from '@shared/plan'

type Db = ReturnType<typeof getDb>
/** Works with both the pooled db and a transaction handle. */
type Tx = Pick<Db, 'select' | 'insert' | 'update' | 'delete'>

export async function loadPlan(tx: Tx, trialId: number) {
  const events = await tx
    .select()
    .from(applicationEvent)
    .where(eq(applicationEvent.trialId, trialId))
    .orderBy(asc(applicationEvent.plannedDate), asc(applicationEvent.sequence))
  const eventIds = events.map((e) => e.id)
  const occurrences = eventIds.length
    ? await tx
        .select()
        .from(eventOccurrence)
        .where(inArray(eventOccurrence.eventId, eventIds))
        .orderBy(asc(eventOccurrence.eventId), asc(eventOccurrence.id))
    : []
  const mixes = eventIds.length
    ? await tx
        .select()
        .from(treatmentMix)
        .where(inArray(treatmentMix.eventId, eventIds))
        .orderBy(asc(treatmentMix.eventId), asc(treatmentMix.treatmentId))
    : []
  return { events, occurrences, mixes }
}

export async function nextSequence(tx: Tx, trialId: number): Promise<number> {
  const [{ max }] = await tx
    .select({ max: sql<number>`coalesce(max(${applicationEvent.sequence}), 0)` })
    .from(applicationEvent)
    .where(eq(applicationEvent.trialId, trialId))
  return Number(max) + 1
}

/**
 * Find a pending, non-cancelled event on `date`, or create one with the next unused label.
 * Completed events on the same date are never reused — a new spray operation is a new event.
 */
export async function findOrCreateEventAtDate(
  tx: Tx,
  trialId: number,
  date: string,
  createdFrom: string
) {
  const [existing] = await tx
    .select()
    .from(applicationEvent)
    .where(
      and(
        eq(applicationEvent.trialId, trialId),
        eq(applicationEvent.plannedDate, date),
        eq(applicationEvent.executionStatus, 'pending'),
        eq(applicationEvent.planningStatus, 'planned')
      )
    )
  if (existing) return existing

  const all = await tx
    .select({ label: applicationEvent.label })
    .from(applicationEvent)
    .where(eq(applicationEvent.trialId, trialId))
  const [label] = nextLabels(new Set(all.map((e) => e.label)), 1)
  const seq = await nextSequence(tx, trialId)
  const [created] = await tx
    .insert(applicationEvent)
    .values({ trialId, sequence: seq, label, plannedDate: date, createdFrom })
    .returning()
  return created
}

/** Delete pending planned events that no longer contain any occurrences. */
export async function deleteEmptyPendingEvents(tx: Tx, trialId: number): Promise<number[]> {
  const events = await tx
    .select({ id: applicationEvent.id })
    .from(applicationEvent)
    .where(
      and(
        eq(applicationEvent.trialId, trialId),
        eq(applicationEvent.executionStatus, 'pending'),
        eq(applicationEvent.planningStatus, 'planned')
      )
    )
  if (!events.length) return []
  const ids = events.map((e) => e.id)
  const counts = await tx
    .select({ eventId: eventOccurrence.eventId, count: sql<number>`count(*)` })
    .from(eventOccurrence)
    .where(inArray(eventOccurrence.eventId, ids))
    .groupBy(eventOccurrence.eventId)
  const nonEmpty = new Set(counts.filter((c) => Number(c.count) > 0).map((c) => c.eventId))
  const empty = ids.filter((id) => !nonEmpty.has(id))
  if (empty.length) await tx.delete(applicationEvent).where(inArray(applicationEvent.id, empty))
  return empty
}

/**
 * Move occurrences to a (possibly new) pending event on `newDate`, then clean up any events
 * left empty. Returns the target event. The caller is responsible for guarding completed
 * events before calling.
 */
export async function moveOccurrencesToDate(
  tx: Tx,
  trialId: number,
  occurrenceIds: number[],
  newDate: string,
  createdFrom: string
) {
  const target = await findOrCreateEventAtDate(tx, trialId, newDate, createdFrom)
  await tx
    .update(eventOccurrence)
    .set({ eventId: target.id })
    .where(inArray(eventOccurrence.id, occurrenceIds))
  await deleteEmptyPendingEvents(tx, trialId)
  return target
}
