import type { ProjectSnapshot } from '@shared/types'

export interface Observation {
  treatment: number
  rep: number
  /** Incomplete block within the replicate (ALPHA); equals rep for complete-block designs. */
  block: number
  value: number
}

/**
 * Assemble long-form observations for one measurement header from the snapshot:
 * one observation per plot, whose value is the mean of that plot's recorded
 * subsamples (a single measurement is just the mean of one). Plots with no value
 * and excluded plots are omitted. `treatment` is the treatment *number*.
 */
export function buildObservations(snapshot: ProjectSnapshot, headerId: number): Observation[] {
  const plotById = new Map(snapshot.plots.map((p) => [p.id!, p]))
  const trtNumberById = new Map(snapshot.treatments.map((t) => [t.id!, t.number]))
  // Accumulate subsample sum + count per plot, preserving first-seen order.
  const acc = new Map<
    number,
    { sum: number; count: number; rep: number; block: number; treatment: number }
  >()
  for (const v of snapshot.measurementValues) {
    if (v.measurementHeaderId !== headerId || v.value === null) continue
    const plot = plotById.get(v.plotId)
    if (!plot || plot.excluded) continue // excluded plots are omitted from analysis
    const treatment = trtNumberById.get(plot.treatmentId)
    if (treatment === undefined) continue
    const cur = acc.get(v.plotId)
    if (cur) {
      cur.sum += v.value
      cur.count += 1
    } else {
      acc.set(v.plotId, { sum: v.value, count: 1, rep: plot.rep, block: plot.block, treatment })
    }
  }
  const out: Observation[] = []
  for (const { sum, count, rep, block, treatment } of acc.values()) {
    out.push({ treatment, rep, block, value: sum / count })
  }
  return out
}
