import { describe, it, expect } from 'vitest'
import {
  ratePerM2,
  applyOverage,
  calculateMix,
  buildEventMixes,
  formatQuantity,
  formatTotal,
  type MixInput
} from './appcalc'

const liquid = (name: string, rate: number | null, unit: 'L/ha' | 'ml/m2' = 'L/ha') => ({
  productName: name,
  physicalForm: 'liquid' as const,
  rateValue: rate,
  rateUnit: unit
})
const solid = (name: string, rate: number | null, unit: 'kg/ha' | 'g/m2' = 'kg/ha') => ({
  productName: name,
  physicalForm: 'solid' as const,
  rateValue: rate,
  rateUnit: unit
})

const baseMix = (over: Partial<MixInput> = {}): MixInput => ({
  treatmentNumber: 4,
  treatmentName: 'Integrated programme',
  plotAreaM2: 1,
  plotCount: 4,
  waterVolumeLPerHa: 500,
  overageEnabled: false,
  overagePct: 0,
  products: [],
  ...over
})

describe('ratePerM2', () => {
  it('converts L/ha to ml/m² (×0.1)', () => {
    expect(ratePerM2(1, 'L/ha')).toEqual({ perM2: 0.1, unit: 'ml' })
    expect(ratePerM2(20, 'L/ha')).toEqual({ perM2: 2, unit: 'ml' })
  })
  it('converts kg/ha to g/m² (×0.1)', () => {
    expect(ratePerM2(0.5, 'kg/ha')).toEqual({ perM2: 0.05, unit: 'g' })
  })
  it('passes per-m² units through', () => {
    expect(ratePerM2(2.5, 'ml/m2')).toEqual({ perM2: 2.5, unit: 'ml' })
    expect(ratePerM2(1.2, 'g/m2')).toEqual({ perM2: 1.2, unit: 'g' })
  })
})

describe('calculateMix — the brief §20 worked example', () => {
  // Treatment 4: 4 plots × 1 m², water 500 L/ha, A 1 L/ha, B 20 L/ha, C 0.5 kg/ha.
  const result = calculateMix(
    baseMix({ products: [liquid('Product A', 1), liquid('Product B', 20), solid('Product C', 0.5)] })
  )

  it('treated area = plot area × plots', () => {
    expect(result.treatedAreaM2).toBe(4)
  })
  it('water measured once for the mix: 500 L/ha × 4 m² × 0.1 = 200 ml', () => {
    expect(result.water?.total).toBeCloseTo(200)
    expect(result.water?.perPlot).toBeCloseTo(50)
    expect(result.water?.unit).toBe('ml')
  })
  it('Product A 1 L/ha → add 0.4 ml', () => {
    expect(result.products[0].quantity?.total).toBeCloseTo(0.4)
    expect(result.products[0].quantity?.unit).toBe('ml')
  })
  it('Product B 20 L/ha → add 8 ml', () => {
    expect(result.products[1].quantity?.total).toBeCloseTo(8)
  })
  it('Product C 0.5 kg/ha → add 0.2 g', () => {
    expect(result.products[2].quantity?.total).toBeCloseTo(0.2)
    expect(result.products[2].quantity?.unit).toBe('g')
  })
  it('water is not reduced by product volume (products are added to the water)', () => {
    // Water stays 200 ml regardless of the 8.4 ml of liquid product added.
    expect(result.water?.total).toBeCloseTo(200)
  })
  it('multiple products trigger the tank-mix confirmation warning', () => {
    expect(result.warnings.some((w) => w.includes('tank mixed'))).toBe(true)
  })
})

describe('calculateMix — per-plot and simplified equivalences (brief §16)', () => {
  it('liquid: totalProductMl = rate × treatedArea × 0.1', () => {
    const r = calculateMix(baseMix({ plotAreaM2: 2.5, plotCount: 6, products: [liquid('X', 3)] }))
    expect(r.products[0].quantity?.total).toBeCloseTo(3 * 15 * 0.1)
    expect(r.products[0].quantity?.perPlot).toBeCloseTo(0.3 * 2.5)
  })
  it('solid: totalProductG = rate × treatedArea × 0.1', () => {
    const r = calculateMix(baseMix({ plotAreaM2: 2, plotCount: 3, products: [solid('Y', 4)] }))
    expect(r.products[0].quantity?.total).toBeCloseTo(4 * 6 * 0.1)
  })
  it('water: totalWaterMl = waterLPerHa × treatedArea × 0.1', () => {
    const r = calculateMix(baseMix({ plotAreaM2: 3, plotCount: 5, waterVolumeLPerHa: 400 }))
    expect(r.water?.total).toBeCloseTo(400 * 15 * 0.1)
  })
})

describe('overage', () => {
  it('applyOverage scales by (1 + pct/100)', () => {
    expect(applyOverage(200, true, 10)).toBeCloseTo(220)
    expect(applyOverage(200, false, 10)).toBe(200)
  })
  it('applies to water AND products, preserving concentration', () => {
    const r = calculateMix(
      baseMix({ overageEnabled: true, overagePct: 25, products: [liquid('A', 1)] })
    )
    expect(r.water?.total).toBeCloseTo(200)
    expect(r.water?.adjustedTotal).toBeCloseTo(250)
    expect(r.products[0].quantity?.total).toBeCloseTo(0.4)
    expect(r.products[0].quantity?.adjustedTotal).toBeCloseTo(0.5)
    // Concentration unchanged: product/water ratio identical before and after.
    expect(r.products[0].quantity!.adjustedTotal / r.water!.adjustedTotal).toBeCloseTo(
      r.products[0].quantity!.total / r.water!.total
    )
  })
  it('adjusted equals base when disabled (percentage stored but off)', () => {
    const r = calculateMix(baseMix({ overageEnabled: false, overagePct: 25, products: [liquid('A', 1)] }))
    expect(r.products[0].quantity?.adjustedTotal).toBeCloseTo(0.4)
  })
})

describe('edge cases', () => {
  it('untreated treatment (no products): no water demanded, no warnings about mixing', () => {
    const r = calculateMix(baseMix({ products: [], waterVolumeLPerHa: null }))
    expect(r.water).toBeNull()
    expect(r.products).toHaveLength(0)
    expect(r.warnings).toHaveLength(0)
  })
  it('missing rate yields null quantity + warning, not zero', () => {
    const r = calculateMix(baseMix({ products: [liquid('X', null)] }))
    expect(r.products[0].quantity).toBeNull()
    expect(r.warnings.some((w) => w.includes('no valid rate'))).toBe(true)
  })
  it('zero plot area warns and produces no quantities', () => {
    const r = calculateMix(baseMix({ plotAreaM2: 0, products: [liquid('X', 1)] }))
    expect(r.warnings.some((w) => w.includes('Plot area'))).toBe(true)
    expect(r.products[0].quantity).toBeNull()
  })
  it('zero plots warns', () => {
    const r = calculateMix(baseMix({ plotCount: 0, products: [liquid('X', 1)] }))
    expect(r.warnings.some((w) => w.includes('No plots'))).toBe(true)
  })
  it('missing water with products present warns', () => {
    const r = calculateMix(baseMix({ waterVolumeLPerHa: null, products: [liquid('X', 1)] }))
    expect(r.warnings.some((w) => w.includes('No water volume'))).toBe(true)
  })
  it('very small quantities flag belowMeasurable and warn — never silently zero', () => {
    // 0.01 L/ha on 4 m² → 0.004 ml total.
    const r = calculateMix(baseMix({ products: [liquid('Tiny', 0.01)] }))
    expect(r.products[0].quantity?.total).toBeCloseTo(0.004)
    expect(r.products[0].quantity?.belowMeasurable).toBe(true)
    expect(r.warnings.some((w) => w.includes('below the reliable measurement range'))).toBe(true)
  })
  it('unit/form mismatch warns (solid product entered in L/ha)', () => {
    const r = calculateMix(
      baseMix({ products: [{ productName: 'Odd', physicalForm: 'solid', rateValue: 1, rateUnit: 'L/ha' }] })
    )
    expect(r.warnings.some((w) => w.includes('does not match'))).toBe(true)
  })
})

describe('formatQuantity / formatTotal', () => {
  it('keeps tiny quantities visible instead of rounding to zero', () => {
    expect(formatQuantity(0.004, 'ml')).toBe('0.004 ml')
    expect(formatQuantity(0.0004, 'ml')).not.toBe('0 ml')
  })
  it('rounds sensibly by magnitude', () => {
    expect(formatQuantity(8.456, 'ml')).toBe('8.46 ml')
    expect(formatQuantity(123.44, 'ml')).toBe('123.4 ml')
  })
  it('promotes large totals to L/kg', () => {
    expect(formatTotal(1234, 'ml')).toBe('1.23 L')
    expect(formatTotal(2500, 'g')).toBe('2.5 kg')
    expect(formatTotal(200, 'ml')).toBe('200 ml')
  })
})

describe('buildEventMixes', () => {
  const componentById = new Map([
    [1, { id: 1, productId: 11, rateValue: 1, rateUnit: 'L/ha', waterVolumeLPerHa: 500 }],
    [2, { id: 2, productId: 12, rateValue: 0.5, rateUnit: 'kg/ha', waterVolumeLPerHa: null }],
    [3, { id: 3, productId: 13, rateValue: 2, rateUnit: 'L/ha', waterVolumeLPerHa: 300 }]
  ])
  const productById = new Map([
    [11, { id: 11, name: 'Product A', physicalForm: 'liquid', defaultWaterVolLPerHa: null }],
    [12, { id: 12, name: 'Product B', physicalForm: 'solid', defaultWaterVolLPerHa: 400 }],
    [13, { id: 13, name: 'Product C', physicalForm: 'liquid', defaultWaterVolLPerHa: null }]
  ])
  const treatmentById = new Map([
    [21, { id: 21, number: 2, name: 'Standard programme' }],
    [22, { id: 22, number: 3, name: 'Other programme' }]
  ])
  const plots = [
    ...Array.from({ length: 4 }, () => ({ treatmentId: 21, excluded: false })),
    { treatmentId: 21, excluded: true }, // excluded plot must not count
    ...Array.from({ length: 4 }, () => ({ treatmentId: 22, excluded: false }))
  ]
  const occ = (id: number, componentId: number, treatmentId: number, extra: Record<string, unknown> = {}) => ({
    id,
    eventId: 100,
    componentId,
    treatmentId,
    plannedRateValue: null,
    plannedRateUnit: '',
    status: 'planned',
    subMixIndex: 0,
    ...extra
  })

  it('one mix per treatment; treatments are never combined', () => {
    const mixes = buildEventMixes({
      eventId: 100,
      occurrences: [occ(1, 1, 21), occ(2, 2, 21), occ(3, 3, 22)],
      componentById,
      productById,
      treatmentById,
      plots,
      plotAreaM2: 1,
      mixSettings: []
    })
    expect(mixes).toHaveLength(2)
    expect(mixes[0].treatmentNumber).toBe(2)
    expect(mixes[0].products).toHaveLength(2)
    expect(mixes[1].treatmentNumber).toBe(3)
    expect(mixes[1].products).toHaveLength(1)
  })

  it('plot count comes from the non-excluded plot allocation', () => {
    const [mix] = buildEventMixes({
      eventId: 100,
      occurrences: [occ(1, 1, 21)],
      componentById,
      productById,
      treatmentById,
      plots,
      plotAreaM2: 1,
      mixSettings: []
    })
    expect(mix.plotCount).toBe(4) // 5 plots minus 1 excluded
  })

  it('occurrence rate override wins over the component default', () => {
    const [mix] = buildEventMixes({
      eventId: 100,
      occurrences: [occ(1, 1, 21, { plannedRateValue: 1.5, plannedRateUnit: 'L/ha' })],
      componentById,
      productById,
      treatmentById,
      plots,
      plotAreaM2: 1,
      mixSettings: []
    })
    expect(mix.products[0].rateValue).toBe(1.5)
    expect(mix.products[0].rateIsOverride).toBe(true)
  })

  it('water precedence: mix setting → component → product default', () => {
    const setting = [{ treatmentId: 21, waterVolumeLPerHa: 600, overageEnabled: true, overagePct: 10 }]
    const withSetting = buildEventMixes({
      eventId: 100,
      occurrences: [occ(1, 1, 21)],
      componentById,
      productById,
      treatmentById,
      plots,
      plotAreaM2: 1,
      mixSettings: setting
    })[0]
    expect(withSetting.waterVolumeLPerHa).toBe(600)
    expect(withSetting.overageEnabled).toBe(true)

    const fromComponent = buildEventMixes({
      eventId: 100,
      occurrences: [occ(1, 1, 21)],
      componentById,
      productById,
      treatmentById,
      plots,
      plotAreaM2: 1,
      mixSettings: []
    })[0]
    expect(fromComponent.waterVolumeLPerHa).toBe(500)

    const fromProduct = buildEventMixes({
      eventId: 100,
      occurrences: [occ(2, 2, 21)], // component 2 has no water; product B defaults 400
      componentById,
      productById,
      treatmentById,
      plots,
      plotAreaM2: 1,
      mixSettings: []
    })[0]
    expect(fromProduct.waterVolumeLPerHa).toBe(400)
  })

  it('cancelled occurrences and other events are excluded', () => {
    const mixes = buildEventMixes({
      eventId: 100,
      occurrences: [
        occ(1, 1, 21, { status: 'cancelled' }),
        occ(2, 2, 21, { eventId: 999 })
      ],
      componentById,
      productById,
      treatmentById,
      plots,
      plotAreaM2: 1,
      mixSettings: []
    })
    expect(mixes).toHaveLength(0)
  })

  it('subMixIndex splits a treatment into separate spray operations', () => {
    const mixes = buildEventMixes({
      eventId: 100,
      occurrences: [occ(1, 1, 21), occ(2, 2, 21, { subMixIndex: 1 })],
      componentById,
      productById,
      treatmentById,
      plots,
      plotAreaM2: 1,
      mixSettings: []
    })
    expect(mixes).toHaveLength(2)
    expect(mixes.map((m) => m.subMixIndex)).toEqual([0, 1])
  })

  it('untreated check (no occurrences) produces no mix', () => {
    const mixes = buildEventMixes({
      eventId: 100,
      occurrences: [],
      componentById,
      productById,
      treatmentById,
      plots,
      plotAreaM2: 1,
      mixSettings: []
    })
    expect(mixes).toHaveLength(0)
  })
})
