import type { Product, Treatment, TreatmentComponent } from './types'
import { ScheduleRule } from './schedule'

/**
 * Treatment-set and component validation (brief §5–§7). Pure functions shared by the
 * protocol editor (live feedback) and the API routes (server-side enforcement).
 */

export type ValidationLevel = 'error' | 'warning'

export interface ValidationIssue {
  level: ValidationLevel
  code: string
  message: string
  /** Treatment number the issue concerns, when treatment-specific. */
  treatmentNumber?: number
}

/**
 * Validate a protocol's treatment set.
 *
 * `formulasUseControl` — whether any measurement formula references `control()` / `abbott()`.
 * The control-mean implementation (src/shared/derive.ts) pools plots across *all* check
 * treatments, so the correct constraint is "at least one check when control formulas exist",
 * not "exactly one" — multiple checks are valid and their plots are averaged together.
 */
export function validateTreatmentSet(
  treatments: Pick<Treatment, 'number' | 'name' | 'isCheck'>[],
  opts: { formulasUseControl?: boolean } = {}
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // Unique treatment numbers.
  const seen = new Map<number, number>()
  for (const t of treatments) seen.set(t.number, (seen.get(t.number) ?? 0) + 1)
  for (const [number, count] of seen) {
    if (count > 1) {
      issues.push({
        level: 'error',
        code: 'duplicate_number',
        message: `Treatment number ${number} is used ${count} times`,
        treatmentNumber: number
      })
    }
  }

  // Contiguous numbering from 1 (randomization + ANOVA label treatments by number).
  if (treatments.length > 0) {
    const numbers = [...seen.keys()].sort((a, b) => a - b)
    const contiguous = numbers[0] === 1 && numbers[numbers.length - 1] === numbers.length
    if (!contiguous) {
      issues.push({
        level: 'warning',
        code: 'non_contiguous',
        message: `Treatment numbers are not contiguous from 1 (found ${numbers.join(', ')})`
      })
    }
  }

  // Required names.
  for (const t of treatments) {
    if (!t.name.trim()) {
      issues.push({
        level: 'error',
        code: 'missing_name',
        message: `Treatment ${t.number} has no name`,
        treatmentNumber: t.number
      })
    }
  }

  // Check treatment: required when control()/abbott() formulas exist; ≥1, not exactly 1.
  const checkCount = treatments.filter((t) => t.isCheck).length
  if (opts.formulasUseControl && checkCount === 0) {
    issues.push({
      level: 'error',
      code: 'missing_check',
      message:
        'A measurement formula uses control()/abbott() but no treatment is marked as the untreated check'
    })
  }

  return issues
}

export interface RateCheckResult {
  /** false when the rate is outside the product's configured range (a reason is required). */
  inRange: boolean
  /** true when the range could not be assessed (no range configured, or unit mismatch). */
  notAssessed: boolean
  message: string
}

/**
 * Check a component's rate against its product's configured expected range. Out-of-range rates
 * are *not* blocked (experimental trials may deliberately test non-standard rates) — they
 * require a deviation reason, surface on the approval screen, and are audited.
 *
 * The range is only assessed when the component's unit matches the product's default unit;
 * comparing across units would need a conversion framework the brief asks us to avoid.
 */
export function checkRateAgainstProduct(
  rateValue: number | null,
  rateUnit: string,
  p: Pick<Product, 'minRateValue' | 'maxRateValue' | 'defaultRateUnit' | 'name'>
): RateCheckResult {
  if (rateValue == null) return { inRange: true, notAssessed: true, message: '' }
  if (p.minRateValue == null && p.maxRateValue == null) {
    return { inRange: true, notAssessed: true, message: '' }
  }
  if (rateUnit !== p.defaultRateUnit) {
    return {
      inRange: true,
      notAssessed: true,
      message: `Rate range for ${p.name} is configured in ${p.defaultRateUnit}; entered in ${rateUnit} — not checked`
    }
  }
  const lo = p.minRateValue ?? -Infinity
  const hi = p.maxRateValue ?? Infinity
  if (rateValue < lo || rateValue > hi) {
    const range = [
      p.minRateValue != null ? `${p.minRateValue}` : '',
      p.maxRateValue != null ? `${p.maxRateValue}` : ''
    ]
      .filter(Boolean)
      .join('–')
    return {
      inRange: false,
      notAssessed: false,
      message: `Entered rate ${rateValue} ${rateUnit} is outside the expected range (${range} ${p.defaultRateUnit}) — explanation required`
    }
  }
  return { inRange: true, notAssessed: false, message: '' }
}

/**
 * Validate one component (rate presence/positivity, schedule rule shape, out-of-range reason,
 * duplicate product within the treatment).
 */
export function validateComponent(
  component: Pick<
    TreatmentComponent,
    'productId' | 'rateValue' | 'rateUnit' | 'rateOutOfRangeReason' | 'scheduleRule'
  >,
  product:
    | Pick<Product, 'minRateValue' | 'maxRateValue' | 'defaultRateUnit' | 'name'>
    | undefined,
  siblingProductIds: number[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (component.rateValue != null && component.rateValue <= 0) {
    issues.push({ level: 'error', code: 'invalid_rate', message: 'Rate must be greater than zero' })
  }

  const rule = ScheduleRule.safeParse(component.scheduleRule)
  if (!rule.success) {
    issues.push({ level: 'error', code: 'invalid_rule', message: 'Scheduling rule is invalid' })
  }

  if (product) {
    const check = checkRateAgainstProduct(component.rateValue, component.rateUnit, product)
    if (!check.inRange && !component.rateOutOfRangeReason.trim()) {
      issues.push({ level: 'error', code: 'rate_out_of_range', message: check.message })
    }
  }

  // Same product twice in one treatment: warn — the brief allows a defensible exceptional
  // workflow (e.g. different rates in different trial phases), so this is not a hard error.
  if (siblingProductIds.includes(component.productId)) {
    issues.push({
      level: 'warning',
      code: 'duplicate_product',
      message: `${product?.name ?? 'This product'} already appears in this treatment — confirm this is intentional`
    })
  }

  return issues
}
