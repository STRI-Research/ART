import { z } from 'zod'

/**
 * Typed scheduling rules for treatment components. Stored as JSONB on
 * `treatment_component.schedule_rule` — a discriminated union rather than a column per rule
 * type, so future weather/model-driven rules (GDD, growth potential, disease pressure) extend
 * the union without schema changes.
 *
 * The rule generates the *target* schedule; generated occurrences remain manually adjustable
 * (move / merge / split / cancel) at the trial level. `gdd`, `growth_potential` and
 * `review_pressure` are placeholders until a weather adapter exists: they generate
 * decision-required occurrences rather than concrete dates.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)')

export const ScheduleRule = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('once'),
    /** Optional fixed date; when absent the occurrence anchors to the trial start. */
    plannedDate: isoDate.optional()
  }),
  z.object({
    type: z.literal('calendar_interval'),
    intervalDays: z.number().int().min(1).max(365)
  }),
  z.object({
    type: z.literal('weekly_interval'),
    intervalWeeks: z.number().int().min(1).max(52)
  }),
  z.object({
    type: z.literal('monthly'),
    intervalMonths: z.number().int().min(1).max(12).default(1)
  }),
  z.object({
    type: z.literal('manual'),
    dates: z.array(isoDate).default([])
  }),
  z.object({
    type: z.literal('gdd'),
    targetGdd: z.number().positive(),
    baseTempC: z.number().optional(),
    modelConfig: z.record(z.unknown()).optional()
  }),
  z.object({
    type: z.literal('growth_potential'),
    threshold: z.number().optional(),
    modelConfig: z.record(z.unknown()).optional()
  }),
  z.object({
    type: z.literal('review_pressure'),
    reviewAfterDays: z.number().int().positive().optional(),
    modelRef: z.string().optional(),
    modelConfig: z.record(z.unknown()).optional()
  })
])
export type ScheduleRule = z.infer<typeof ScheduleRule>

export type ScheduleRuleType = ScheduleRule['type']

/** Human-readable one-line label for a rule, used in the components table and the timeline. */
export function ruleLabel(rule: ScheduleRule): string {
  switch (rule.type) {
    case 'once':
      return rule.plannedDate ? `Once (${rule.plannedDate})` : 'Once'
    case 'calendar_interval':
      return `Every ${rule.intervalDays} day${rule.intervalDays === 1 ? '' : 's'}`
    case 'weekly_interval':
      return `Every ${rule.intervalWeeks} week${rule.intervalWeeks === 1 ? '' : 's'}`
    case 'monthly':
      return rule.intervalMonths === 1 ? 'Monthly' : `Every ${rule.intervalMonths} months`
    case 'manual':
      return rule.dates.length ? `Manual (${rule.dates.length} date${rule.dates.length === 1 ? '' : 's'})` : 'Manual'
    case 'gdd':
      return `Every ${rule.targetGdd} GDD`
    case 'growth_potential':
      return rule.threshold != null ? `Growth potential ≥ ${rule.threshold}` : 'Growth potential'
    case 'review_pressure':
      return 'Review pressure'
  }
}

/** Rules that produce concrete calendar dates today (vs. model-driven placeholders). */
export function isDateDriven(rule: ScheduleRule): boolean {
  return (
    rule.type === 'once' ||
    rule.type === 'calendar_interval' ||
    rule.type === 'weekly_interval' ||
    rule.type === 'monthly' ||
    rule.type === 'manual'
  )
}

/** Parse an unknown JSONB payload into a ScheduleRule, falling back to `once`. */
export function parseScheduleRule(value: unknown): ScheduleRule {
  const parsed = ScheduleRule.safeParse(value)
  return parsed.success ? parsed.data : { type: 'once' }
}
