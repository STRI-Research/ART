import type { PhysicalForm, RateUnit } from './types'

/**
 * The weigh-sheet calculation engine (brief §16): deterministic, pure, and shared — the
 * calculation review UI, the document snapshot, and the printed application pack all call this
 * one implementation. Replaces the manual application spreadsheet.
 *
 * Method (confirmed operational practice):
 *   - water is calculated ONCE per treatment mix and measured first;
 *   - product quantities are ADDED to that water (never subtracted from it);
 *   - overage scales water and all product quantities proportionally (concentration unchanged).
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
export interface MixProductInput {
  /** Display / trace fields carried through to results and printing. */
  componentId?: number
  occurrenceId?: number
  productName: string
  striCode?: string
  mappNumber?: string
  physicalForm: PhysicalForm
  rateValue: number | null
  rateUnit: RateUnit
  /** True when the applied rate is an occurrence-level override of the component default. */
  rateIsOverride?: boolean
}

export interface MixInput {
  treatmentId?: number
  treatmentNumber: number
  treatmentName: string
  /** Sub-mix index (0 = main mix); same-treatment products that must spray separately. */
  subMixIndex?: number
  plotAreaM2: number
  plotCount: number
  /** Shared water volume for the whole mix; null = not set (warning). */
  waterVolumeLPerHa: number | null
  overageEnabled: boolean
  overagePct: number
  products: MixProductInput[]
}

export interface CalcOptions {
  /** Smallest reliably measurable liquid quantity (ml). */
  minMeasurableMl?: number
  /** Smallest reliably weighable solid quantity (g). */
  minMeasurableG?: number
}

const DEFAULT_OPTIONS: Required<CalcOptions> = {
  minMeasurableMl: 0.1,
  minMeasurableG: 0.01
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
export interface QuantityResult {
  /** Measured unit: 'ml' for liquids, 'g' for solids. */
  unit: 'ml' | 'g'
  perM2: number
  perPlot: number
  total: number
  /** Total including overage (equals total when overage is off). */
  adjustedTotal: number
  /** Below the reliable measurement range of the configured equipment. */
  belowMeasurable: boolean
}

export interface MixProductResult extends MixProductInput {
  quantity: QuantityResult | null
}

export interface MixResult {
  treatmentId?: number
  treatmentNumber: number
  treatmentName: string
  subMixIndex: number
  plotAreaM2: number
  plotCount: number
  treatedAreaM2: number
  waterVolumeLPerHa: number | null
  water: QuantityResult | null
  overageEnabled: boolean
  overagePct: number
  products: MixProductResult[]
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Core conversions
// ---------------------------------------------------------------------------
/**
 * A rate in its entry unit → measured quantity per m². Per-hectare units divide by 10,000 m²/ha
 * after converting to the measured unit (L→ml ×1000, kg→g ×1000), i.e. ×0.1; per-m² units pass
 * through. Returns the measured unit implied by the rate unit.
 */
export function ratePerM2(rateValue: number, rateUnit: RateUnit): { perM2: number; unit: 'ml' | 'g' } {
  switch (rateUnit) {
    case 'L/ha':
      return { perM2: (rateValue * 1000) / 10000, unit: 'ml' }
    case 'kg/ha':
      return { perM2: (rateValue * 1000) / 10000, unit: 'g' }
    case 'ml/m2':
      return { perM2: rateValue, unit: 'ml' }
    case 'g/m2':
      return { perM2: rateValue, unit: 'g' }
  }
}

export function applyOverage(quantity: number, enabled: boolean, pct: number): number {
  return enabled ? quantity * (1 + pct / 100) : quantity
}

function quantityFor(
  perM2: number,
  unit: 'ml' | 'g',
  plotAreaM2: number,
  plotCount: number,
  overageEnabled: boolean,
  overagePct: number,
  opts: Required<CalcOptions>
): QuantityResult {
  const perPlot = perM2 * plotAreaM2
  const total = perPlot * plotCount
  const adjustedTotal = applyOverage(total, overageEnabled, overagePct)
  const floor = unit === 'ml' ? opts.minMeasurableMl : opts.minMeasurableG
  return {
    unit,
    perM2,
    perPlot,
    total,
    adjustedTotal,
    belowMeasurable: total > 0 && total < floor
  }
}

// ---------------------------------------------------------------------------
// Mix calculation
// ---------------------------------------------------------------------------
export function calculateMix(input: MixInput, options: CalcOptions = {}): MixResult {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const warnings: string[] = []

  if (!(input.plotAreaM2 > 0)) warnings.push('Plot area is not set — quantities cannot be calculated')
  if (!(input.plotCount > 0)) warnings.push('No plots are assigned to this treatment')
  const treatedAreaM2 = (input.plotAreaM2 || 0) * (input.plotCount || 0)

  // Water: once per mix, shared by every product in it.
  let water: QuantityResult | null = null
  if (input.waterVolumeLPerHa != null && input.waterVolumeLPerHa > 0 && treatedAreaM2 > 0) {
    water = quantityFor(
      (input.waterVolumeLPerHa * 1000) / 10000,
      'ml',
      input.plotAreaM2,
      input.plotCount,
      input.overageEnabled,
      input.overagePct,
      opts
    )
  } else if (input.products.length > 0) {
    warnings.push('No water volume set for this treatment mix')
  }

  const products: MixProductResult[] = input.products.map((p) => {
    if (p.rateValue == null || !(p.rateValue > 0) || treatedAreaM2 <= 0) {
      if (p.rateValue == null || !(p.rateValue > 0)) {
        warnings.push(`${p.productName}: no valid rate — quantity not calculated`)
      }
      return { ...p, quantity: null }
    }
    const { perM2, unit } = ratePerM2(p.rateValue, p.rateUnit)
    // Cross-check the unit against the product's physical form (a solid at L/ha is suspicious).
    const expectedUnit = p.physicalForm === 'liquid' ? 'ml' : 'g'
    if (unit !== expectedUnit) {
      warnings.push(
        `${p.productName}: rate unit ${p.rateUnit} does not match its ${p.physicalForm} form — check the product record`
      )
    }
    const q = quantityFor(
      perM2,
      unit,
      input.plotAreaM2,
      input.plotCount,
      input.overageEnabled,
      input.overagePct,
      opts
    )
    if (q.belowMeasurable) {
      warnings.push(
        `${p.productName}: total ${formatQuantity(q.total, q.unit)} is below the reliable measurement range`
      )
    }
    return { ...p, quantity: q }
  })

  if (products.filter((p) => p.quantity).length > 1) {
    warnings.push('Multiple products are planned in this treatment mix. Confirm that they can be tank mixed.')
  }

  return {
    treatmentId: input.treatmentId,
    treatmentNumber: input.treatmentNumber,
    treatmentName: input.treatmentName,
    subMixIndex: input.subMixIndex ?? 0,
    plotAreaM2: input.plotAreaM2,
    plotCount: input.plotCount,
    treatedAreaM2,
    waterVolumeLPerHa: input.waterVolumeLPerHa,
    water,
    overageEnabled: input.overageEnabled,
    overagePct: input.overagePct,
    products,
    warnings
  }
}

// ---------------------------------------------------------------------------
// Display rounding (raw values are preserved in results; rounding is display-only
// and never silently rounds a small quantity to zero)
// ---------------------------------------------------------------------------
export function formatQuantity(value: number, unit: 'ml' | 'g' | 'L' | 'kg'): string {
  if (value === 0) return `0 ${unit}`
  const abs = Math.abs(value)
  let rounded: number
  if (unit === 'L' || unit === 'kg') {
    rounded = Math.round(value * 100) / 100
  } else if (abs < 1) {
    rounded = Math.round(value * 1000) / 1000 // keep tiny quantities visible
  } else if (abs < 10) {
    rounded = Math.round(value * 100) / 100
  } else {
    rounded = Math.round(value * 10) / 10
  }
  if (rounded === 0) rounded = value // never display a non-zero quantity as zero
  return `${rounded} ${unit}`
}

/** Litres/kilograms display for large totals: 1,234 ml → "1.23 L". */
export function formatTotal(value: number, unit: 'ml' | 'g'): string {
  if (unit === 'ml' && value >= 1000) return formatQuantity(value / 1000, 'L')
  if (unit === 'g' && value >= 1000) return formatQuantity(value / 1000, 'kg')
  return formatQuantity(value, unit)
}

// ---------------------------------------------------------------------------
// Assembling mix inputs for one application event from trial data
// ---------------------------------------------------------------------------
export interface BuildOccurrence {
  id?: number
  eventId: number
  componentId: number
  treatmentId: number
  plannedRateValue: number | null
  plannedRateUnit: string
  status: string
  subMixIndex: number
}
export interface BuildComponent {
  id?: number
  productId: number
  rateValue: number | null
  rateUnit: string
  waterVolumeLPerHa: number | null
}
export interface BuildProduct {
  id?: number
  name: string
  code?: string
  mappNumber?: string
  physicalForm: string
  defaultWaterVolLPerHa: number | null
}
export interface BuildTreatment {
  id?: number
  number: number
  name: string
}
export interface BuildMixSettings {
  treatmentId: number
  waterVolumeLPerHa: number | null
  overageEnabled: boolean
  overagePct: number
}

/**
 * One MixInput per (treatment, subMixIndex) present in the event — one treatment is one
 * separately prepared mix; quantities are never combined or optimized across treatments, and
 * an untreated treatment (no occurrences) yields no mix. Plot count comes from the randomized
 * plot allocation (excluded plots omitted), not from a typed replicate count. The occurrence's
 * planned-rate override wins over the component default; water precedence is
 * mix setting → component water → product default.
 */
export function buildEventMixes(args: {
  eventId: number
  occurrences: BuildOccurrence[]
  componentById: Map<number, BuildComponent>
  productById: Map<number, BuildProduct>
  treatmentById: Map<number, BuildTreatment>
  plots: { treatmentId: number; excluded: boolean }[]
  plotAreaM2: number
  mixSettings: BuildMixSettings[]
}): MixInput[] {
  const active = args.occurrences.filter(
    (o) => o.eventId === args.eventId && o.status !== 'cancelled'
  )
  const settingsByTrt = new Map(args.mixSettings.map((m) => [m.treatmentId, m]))

  const plotCountByTrt = new Map<number, number>()
  for (const p of args.plots) {
    if (p.excluded) continue
    plotCountByTrt.set(p.treatmentId, (plotCountByTrt.get(p.treatmentId) ?? 0) + 1)
  }

  const groups = new Map<string, BuildOccurrence[]>()
  for (const o of active) {
    const key = `${o.treatmentId}:${o.subMixIndex}`
    const arr = groups.get(key) ?? []
    arr.push(o)
    groups.set(key, arr)
  }

  const mixes: MixInput[] = []
  for (const [key, occ] of groups) {
    const [treatmentIdStr, subMixStr] = key.split(':')
    const treatmentId = Number(treatmentIdStr)
    const trt = args.treatmentById.get(treatmentId)
    const settings = settingsByTrt.get(treatmentId)

    const products: MixProductInput[] = occ.map((o) => {
      const comp = args.componentById.get(o.componentId)
      const prod = comp ? args.productById.get(comp.productId) : undefined
      const override = o.plannedRateValue != null
      return {
        componentId: o.componentId,
        occurrenceId: o.id,
        productName: prod?.name ?? `component #${o.componentId}`,
        striCode: prod?.code,
        mappNumber: prod?.mappNumber,
        physicalForm: (prod?.physicalForm === 'solid' ? 'solid' : 'liquid') as PhysicalForm,
        rateValue: override ? o.plannedRateValue : (comp?.rateValue ?? null),
        rateUnit: (override && o.plannedRateUnit ? o.plannedRateUnit : (comp?.rateUnit ?? 'L/ha')) as RateUnit,
        rateIsOverride: override
      }
    })

    // Water precedence: persisted mix setting → first component with water → product default.
    let water: number | null = settings?.waterVolumeLPerHa ?? null
    if (water == null) {
      for (const o of occ) {
        const w = args.componentById.get(o.componentId)?.waterVolumeLPerHa
        if (w != null && w > 0) {
          water = w
          break
        }
      }
    }
    if (water == null) {
      for (const o of occ) {
        const comp = args.componentById.get(o.componentId)
        const w = comp ? args.productById.get(comp.productId)?.defaultWaterVolLPerHa : null
        if (w != null && w > 0) {
          water = w
          break
        }
      }
    }

    mixes.push({
      treatmentId,
      treatmentNumber: trt?.number ?? 0,
      treatmentName: trt?.name ?? '',
      subMixIndex: Number(subMixStr),
      plotAreaM2: args.plotAreaM2,
      plotCount: plotCountByTrt.get(treatmentId) ?? 0,
      waterVolumeLPerHa: water,
      overageEnabled: settings?.overageEnabled ?? false,
      overagePct: settings?.overagePct ?? 0,
      products
    })
  }

  return mixes.sort(
    (a, b) => a.treatmentNumber - b.treatmentNumber || (a.subMixIndex ?? 0) - (b.subMixIndex ?? 0)
  )
}
