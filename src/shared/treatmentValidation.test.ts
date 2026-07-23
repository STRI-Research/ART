import { describe, it, expect } from 'vitest'
import {
  validateTreatmentSet,
  checkRateAgainstProduct,
  validateComponent
} from './treatmentValidation'

const t = (number: number, name = `T${number}`, isCheck = false) => ({ number, name, isCheck })

describe('validateTreatmentSet', () => {
  it('accepts a clean set', () => {
    expect(validateTreatmentSet([t(1, 'Untreated', true), t(2), t(3)])).toEqual([])
  })

  it('flags duplicate numbers as errors', () => {
    const issues = validateTreatmentSet([t(1), t(1), t(2)])
    expect(issues.some((i) => i.code === 'duplicate_number' && i.level === 'error')).toBe(true)
  })

  it('warns on non-contiguous numbering', () => {
    const issues = validateTreatmentSet([t(1), t(3)])
    expect(issues.some((i) => i.code === 'non_contiguous' && i.level === 'warning')).toBe(true)
  })

  it('requires names', () => {
    const issues = validateTreatmentSet([t(1, '')])
    expect(issues.some((i) => i.code === 'missing_name' && i.treatmentNumber === 1)).toBe(true)
  })

  it('requires at least one check when formulas use control()', () => {
    expect(
      validateTreatmentSet([t(1), t(2)], { formulasUseControl: true }).some(
        (i) => i.code === 'missing_check'
      )
    ).toBe(true)
    // ≥1 is enough — and multiple checks are allowed (control mean pools all check plots).
    expect(
      validateTreatmentSet([t(1, 'U1', true), t(2, 'U2', true), t(3)], {
        formulasUseControl: true
      })
    ).toEqual([])
  })

  it('does not require a check without control formulas', () => {
    expect(validateTreatmentSet([t(1), t(2)])).toEqual([])
  })
})

describe('checkRateAgainstProduct', () => {
  const product = {
    name: 'Product A',
    minRateValue: 0.4,
    maxRateValue: 0.8,
    defaultRateUnit: 'L/ha' as const
  }

  it('accepts in-range rates', () => {
    const r = checkRateAgainstProduct(0.6, 'L/ha', product)
    expect(r.inRange).toBe(true)
    expect(r.notAssessed).toBe(false)
  })

  it('accepts boundary rates', () => {
    expect(checkRateAgainstProduct(0.4, 'L/ha', product).inRange).toBe(true)
    expect(checkRateAgainstProduct(0.8, 'L/ha', product).inRange).toBe(true)
  })

  it('flags out-of-range rates with a message (brief §7 example)', () => {
    const r = checkRateAgainstProduct(1.5, 'L/ha', product)
    expect(r.inRange).toBe(false)
    expect(r.message).toContain('outside the expected range')
  })

  it('skips assessment when units differ', () => {
    const r = checkRateAgainstProduct(1.5, 'ml/m2', product)
    expect(r.inRange).toBe(true)
    expect(r.notAssessed).toBe(true)
  })

  it('skips assessment when no range is configured', () => {
    const r = checkRateAgainstProduct(99, 'L/ha', {
      name: 'X',
      minRateValue: null,
      maxRateValue: null,
      defaultRateUnit: 'L/ha'
    })
    expect(r.notAssessed).toBe(true)
  })

  it('handles open-ended ranges', () => {
    const minOnly = { name: 'X', minRateValue: 1, maxRateValue: null, defaultRateUnit: 'L/ha' as const }
    expect(checkRateAgainstProduct(0.5, 'L/ha', minOnly).inRange).toBe(false)
    expect(checkRateAgainstProduct(2, 'L/ha', minOnly).inRange).toBe(true)
  })
})

describe('validateComponent', () => {
  const product = {
    name: 'Product A',
    minRateValue: 0.4,
    maxRateValue: 0.8,
    defaultRateUnit: 'L/ha' as const
  }
  const base = {
    productId: 1,
    rateValue: 0.6,
    rateUnit: 'L/ha' as const,
    rateOutOfRangeReason: '',
    scheduleRule: { type: 'calendar_interval', intervalDays: 14 }
  }

  it('accepts a valid component', () => {
    expect(validateComponent(base, product, [])).toEqual([])
  })

  it('rejects non-positive rates', () => {
    const issues = validateComponent({ ...base, rateValue: 0 }, product, [])
    expect(issues.some((i) => i.code === 'invalid_rate')).toBe(true)
  })

  it('rejects malformed schedule rules', () => {
    const issues = validateComponent({ ...base, scheduleRule: { type: 'bogus' } }, product, [])
    expect(issues.some((i) => i.code === 'invalid_rule')).toBe(true)
  })

  it('requires a reason for out-of-range rates, satisfied when provided', () => {
    const bad = validateComponent({ ...base, rateValue: 1.5 }, product, [])
    expect(bad.some((i) => i.code === 'rate_out_of_range' && i.level === 'error')).toBe(true)
    const ok = validateComponent(
      { ...base, rateValue: 1.5, rateOutOfRangeReason: 'Deliberate high-rate test arm' },
      product,
      []
    )
    expect(ok.some((i) => i.code === 'rate_out_of_range')).toBe(false)
  })

  it('warns (not errors) on duplicate product within a treatment', () => {
    const issues = validateComponent(base, product, [1])
    expect(issues.some((i) => i.code === 'duplicate_product' && i.level === 'warning')).toBe(true)
  })
})
