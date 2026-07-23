import { addDays } from './timing'
import { isDateDriven, parseScheduleRule, type ScheduleRule } from './schedule'

/**
 * Pure application-plan domain logic (brief §§8–12): generating a trial's application events
 * from component scheduling rules, combining same-day occurrences into lettered events,
 * detecting funded-count conflicts, and computing rebases. No DB, no React — the API routes
 * orchestrate persistence, this module owns the semantics and is exhaustively unit-tested.
 */

// ---------------------------------------------------------------------------
// Event lettering: A…Z, AA, AB… (Excel-style)
// ---------------------------------------------------------------------------
export function eventLabel(index: number): string {
  let n = index
  let label = ''
  for (;;) {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
    if (n < 0) return label
  }
}

/** The next `count` labels not present in `used`, in alphabetical order. */
export function nextLabels(used: ReadonlySet<string>, count: number): string[] {
  const out: string[] = []
  for (let i = 0; out.length < count; i++) {
    const l = eventLabel(i)
    if (!used.has(l)) out.push(l)
  }
  return out
}

// ---------------------------------------------------------------------------
// Occurrence generation from a component's scheduling rule
// ---------------------------------------------------------------------------
export interface PlanComponent {
  id: number
  treatmentId: number
  scheduleRule: unknown
  /** ISO dates; '' = unbounded. */
  activeFrom: string
  activeUntil: string
  maxOccurrences: number | null
  fromOccurrence: number | null
}

export interface GeneratedOccurrence {
  componentId: number
  treatmentId: number
  date: string
  /** Model-driven rules can't compute dates yet — the occurrence needs a manual decision. */
  decisionRequired: boolean
}

function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return ''
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, daysInMonth))
  return d.toISOString().slice(0, 10)
}

/** Raw dates a rule produces inside [startDate, endDate], before window/occurrence filters. */
function ruleDates(rule: ScheduleRule, startDate: string, endDate: string): { date: string; decisionRequired: boolean }[] {
  switch (rule.type) {
    case 'once':
      return [{ date: rule.plannedDate ?? startDate, decisionRequired: false }]
    case 'calendar_interval':
    case 'weekly_interval': {
      const step = rule.type === 'calendar_interval' ? rule.intervalDays : rule.intervalWeeks * 7
      const out: { date: string; decisionRequired: boolean }[] = []
      for (let d = startDate; d && d <= endDate; d = addDays(d, step)) {
        out.push({ date: d, decisionRequired: false })
        if (out.length > 400) break // guard against degenerate inputs
      }
      return out
    }
    case 'monthly': {
      const out: { date: string; decisionRequired: boolean }[] = []
      for (let i = 0; ; i++) {
        const d = i === 0 ? startDate : addMonths(startDate, i * rule.intervalMonths)
        if (!d || d > endDate) break
        out.push({ date: d, decisionRequired: false })
        if (out.length > 60) break
      }
      return out
    }
    case 'manual':
      return rule.dates.map((date) => ({ date, decisionRequired: false }))
    case 'gdd':
    case 'growth_potential':
    case 'review_pressure':
      // Model-driven placeholder: one decision-required occurrence at the start; subsequent
      // occurrences are created as decisions are made (or by the future weather adapter).
      return [{ date: startDate, decisionRequired: true }]
  }
}

/**
 * A component's generated occurrences: rule dates clamped to the component's active window,
 * then `fromOccurrence` (active from the Nth occurrence onward) and `maxOccurrences` applied.
 */
export function generateComponentOccurrences(
  component: PlanComponent,
  trialStart: string,
  trialEnd: string
): GeneratedOccurrence[] {
  const rule = parseScheduleRule(component.scheduleRule)
  const windowStart = component.activeFrom && component.activeFrom > trialStart ? component.activeFrom : trialStart
  const windowEnd = component.activeUntil && component.activeUntil < trialEnd ? component.activeUntil : trialEnd
  if (windowStart > windowEnd) return []

  let dates = ruleDates(rule, windowStart, windowEnd)
  // Manual dates are authored explicitly; others are clamped to the active window by generation.
  if (rule.type === 'manual') dates = dates.filter((d) => d.date >= windowStart && d.date <= windowEnd)

  if (component.fromOccurrence != null && component.fromOccurrence > 1) {
    dates = dates.slice(component.fromOccurrence - 1)
  }
  if (component.maxOccurrences != null) {
    dates = dates.slice(0, component.maxOccurrences)
  }
  return dates.map((d) => ({
    componentId: component.id,
    treatmentId: component.treatmentId,
    date: d.date,
    decisionRequired: d.decisionRequired
  }))
}

// ---------------------------------------------------------------------------
// Combining occurrences into events (same date → one event)
// ---------------------------------------------------------------------------
export interface GeneratedEvent {
  plannedDate: string
  decisionRequired: boolean
  occurrences: GeneratedOccurrence[]
}

/** Group occurrences by date, ascending — each distinct date is one application event. */
export function combineIntoEvents(occurrences: GeneratedOccurrence[]): GeneratedEvent[] {
  const byDate = new Map<string, GeneratedOccurrence[]>()
  for (const o of occurrences) {
    const arr = byDate.get(o.date) ?? []
    arr.push(o)
    byDate.set(o.date, arr)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([plannedDate, occ]) => ({
      plannedDate,
      decisionRequired: occ.every((o) => o.decisionRequired),
      occurrences: occ
    }))
}

/** Generate the full plan for a trial from its components. */
export function generatePlan(
  components: PlanComponent[],
  trialStart: string,
  trialEnd: string
): GeneratedEvent[] {
  return combineIntoEvents(
    components.flatMap((c) => generateComponentOccurrences(c, trialStart, trialEnd))
  )
}

// ---------------------------------------------------------------------------
// Regeneration must never touch completed events (brief §12)
// ---------------------------------------------------------------------------
export interface ExistingEventSummary {
  id: number
  label: string
  plannedDate: string
  executionStatus: string
  planningStatus: string
}

export interface RegenerationPlan {
  /** Pending generated events to delete (completed ones are never listed). */
  deleteEventIds: number[]
  /** New events to create, with labels avoiding those frozen on kept events. */
  createEvents: (GeneratedEvent & { label: string })[]
  /** Events kept untouched (completed, or cancelled history). */
  keptEventIds: number[]
}

/**
 * Reconcile a freshly generated plan against existing events: completed (and amended) events
 * are evidence and are always kept with their labels frozen; pending events are replaced.
 * Cancelled events are kept as history. New events receive the next labels not used by kept
 * events, assigned in date order.
 */
export function planRegeneration(
  existing: ExistingEventSummary[],
  generated: GeneratedEvent[]
): RegenerationPlan {
  const kept = existing.filter(
    (e) => e.executionStatus !== 'pending' || e.planningStatus === 'cancelled'
  )
  const deletable = existing.filter(
    (e) => e.executionStatus === 'pending' && e.planningStatus !== 'cancelled'
  )
  const used = new Set(kept.map((e) => e.label))
  const labels = nextLabels(used, generated.length)
  return {
    deleteEventIds: deletable.map((e) => e.id),
    keptEventIds: kept.map((e) => e.id),
    createEvents: generated.map((g, i) => ({ ...g, label: labels[i] }))
  }
}

// ---------------------------------------------------------------------------
// Funded-count conflict detection (brief §9)
// ---------------------------------------------------------------------------
export interface PlanConflict {
  ruleEventCount: number
  fundedCount: number
  difference: number
  /** Closest whole-day interval that fits `fundedCount` events into the window. */
  suggestedIntervalDays: number | null
}

export function daysBetween(startIso: string, endIso: string): number | null {
  const a = new Date(startIso + 'T00:00:00Z').getTime()
  const b = new Date(endIso + 'T00:00:00Z').getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86_400_000)
}

/**
 * Compare the rule-generated event count with the client-funded count. Returns null when there
 * is no conflict (no funded count set, or counts match). Never silently discards an input —
 * the caller shows the difference and resolution options.
 */
export function detectFundedConflict(
  events: readonly { decisionRequired?: boolean }[],
  fundedCount: number | null | undefined,
  trialStart: string,
  trialEnd: string
): PlanConflict | null {
  if (fundedCount == null) return null
  const ruleEventCount = events.length
  if (ruleEventCount === fundedCount) return null
  const span = daysBetween(trialStart, trialEnd)
  const suggestedIntervalDays =
    span != null && fundedCount > 1 ? Math.floor(span / (fundedCount - 1)) : null
  return {
    ruleEventCount,
    fundedCount,
    difference: ruleEventCount - fundedCount,
    suggestedIntervalDays
  }
}

// ---------------------------------------------------------------------------
// Rebasing (brief §12): delta-shift of future pending occurrences
// ---------------------------------------------------------------------------
/**
 * Shift a set of dates by the delta between an occurrence's old and new date. Used for both
 * whole-event rebases and single-component rebases: "every 14 days, moved Saturday→Friday →
 * subsequent occurrences follow from Friday" is exactly a delta shift for interval rules.
 * Returns null when either date is invalid.
 */
export function rebaseDelta(oldDate: string, newDate: string): number | null {
  return daysBetween(oldDate, newDate)
}

export function shiftDate(date: string, deltaDays: number): string {
  return addDays(date, deltaDays)
}

// ---------------------------------------------------------------------------
// Timeline helpers
// ---------------------------------------------------------------------------
export interface EventCountdown {
  daysUntil: number | null
  overdue: boolean
  dueSoon: boolean
}

export function eventCountdown(plannedDate: string, todayIso: string): EventCountdown {
  const d = daysBetween(todayIso, plannedDate)
  if (d == null) return { daysUntil: null, overdue: false, dueSoon: false }
  return { daysUntil: d, overdue: d < 0, dueSoon: d >= 0 && d <= 7 }
}

/** Whether a component schedule can be generated at all (date-driven or placeholder). */
export function componentIsPlannable(component: PlanComponent): boolean {
  const rule = parseScheduleRule(component.scheduleRule)
  return isDateDriven(rule) || rule.type === 'gdd' || rule.type === 'growth_potential' || rule.type === 'review_pressure'
}
