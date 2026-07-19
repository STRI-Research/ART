import { addDays } from './timing'

/**
 * Dynamic application/assessment scheduling. A schedule is defined by a start date, an interval (days
 * between events) and a count; the finish date is derived (last event = start + (count-1)*interval).
 * The UI keeps start / interval / count / finish linked: editing any one recomputes the others via the
 * `solve*` helpers here. All date maths is pure and UTC-safe (reuses `addDays`), so it is testable and
 * deterministic.
 */

/** Whole days from `a` to `b` (ISO YYYY-MM-DD); null if either is missing/invalid. */
export function daysBetween(a: string, b: string): number | null {
  if (!a || !b) return null
  const da = Date.parse(a + 'T00:00:00Z')
  const db = Date.parse(b + 'T00:00:00Z')
  if (Number.isNaN(da) || Number.isNaN(db)) return null
  return Math.round((db - da) / 86_400_000)
}

/** Day-offsets from the start for `count` events spaced `intervalDays` apart: [0, i, 2i, …]. */
export function eventOffsets(count: number, intervalDays: number): number[] {
  const n = Math.max(0, Math.floor(count))
  const step = Math.max(0, Math.floor(intervalDays))
  return Array.from({ length: n }, (_, i) => i * step)
}

/** ISO date for `offsetDays` after `startDate` ('' if start is unset/invalid). */
export function dateForOffset(startDate: string, offsetDays: number): string {
  return startDate ? addDays(startDate, offsetDays) : ''
}

/** The finish date = start + (count-1)*interval; '' if start unset or count < 1. */
export function finishDate(startDate: string, count: number, intervalDays: number): string {
  if (!startDate || count < 1) return ''
  return addDays(startDate, (Math.floor(count) - 1) * Math.max(0, Math.floor(intervalDays)))
}

/** Interval that spreads `count` events evenly from start to finish (>=2 events). */
export function solveInterval(startDate: string, finish: string, count: number): number | null {
  const span = daysBetween(startDate, finish)
  if (span == null || count < 2) return null
  return Math.max(1, Math.round(span / (count - 1)))
}

/** How many events (including the start) fit from start to finish at `intervalDays`. */
export function solveCount(startDate: string, finish: string, intervalDays: number): number | null {
  const span = daysBetween(startDate, finish)
  if (span == null || intervalDays <= 0) return null
  return Math.max(1, Math.floor(span / intervalDays) + 1)
}

/** An assessment's cadence: first occurrence at `startOffset`, then every `intervalDays` for
 *  `occurrences` times (intervalDays<=0 or occurrences<=1 → a single occurrence at startOffset). */
export interface Cadence {
  startOffset: number
  intervalDays: number
  occurrences: number
}

/** Day-offsets (from the protocol start) for every occurrence of an assessment's cadence. */
export function cadenceOffsets(c: Cadence): number[] {
  const occ = Math.max(1, Math.floor(c.occurrences || 1))
  const step = Math.max(0, Math.floor(c.intervalDays || 0))
  return Array.from({ length: occ }, (_, i) => (c.startOffset || 0) + i * step)
}
