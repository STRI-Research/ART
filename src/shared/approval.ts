import type { MixResult } from './appcalc'

/**
 * Approval-workflow domain (brief §§18–19, 25): the document snapshot, the material-input
 * subset whose hash gates approval validity, and the status machine. Pure and shared; hashing
 * itself (SHA-256) happens server-side in `src/lib/documents.ts`.
 */

/** Bump when calculation logic changes — a calc change is a material change (brief §18). */
export const CALC_ENGINE_VERSION = 1

export const DOC_STATUSES = ['draft', 'awaiting_approval', 'returned', 'approved', 'superseded'] as const
export type DocStatus = (typeof DOC_STATUSES)[number]

/** Legal status transitions; anything else is rejected. */
const TRANSITIONS: Record<DocStatus, DocStatus[]> = {
  draft: ['awaiting_approval', 'superseded'],
  awaiting_approval: ['approved', 'returned', 'draft', 'superseded'], // draft = withdrawn
  returned: ['awaiting_approval', 'superseded'],
  approved: ['superseded'],
  superseded: []
}

export function canTransition(from: DocStatus, to: DocStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

// ---------------------------------------------------------------------------
// Document snapshot
// ---------------------------------------------------------------------------
/** Everything the printed pack needs, frozen at submission time. */
export interface DocumentSnapshot {
  calcEngineVersion: number
  trial: {
    id: number
    siteName: string
    location: string
    protocolTitle: string
    protocolUid: string
    crop: string
    investigator: string
  }
  event: {
    id: number
    label: string
    plannedDate: string
  }
  plotAreaM2: number
  /** Full calculation results, one per treatment mix (renders the weigh sections exactly). */
  mixes: MixResult[]
  /** Mix-level settings echoed for the material hash (water-in, tank-mix decision). */
  mixSettings: {
    treatmentId: number
    waterIn: boolean
    tankMixStatus: string
  }[]
}

/**
 * The material subset of a snapshot — the inputs whose change invalidates approval (brief
 * §18's material list). Actual/completion details (operator, times, weather, evidence,
 * completion notes) are deliberately absent: they never invalidate a pre-application approval.
 */
export function materialSnapshot(s: DocumentSnapshot): unknown {
  return {
    calc: s.calcEngineVersion,
    eventId: s.event.id,
    plannedDate: s.event.plannedDate,
    plotAreaM2: s.plotAreaM2,
    mixes: s.mixes
      .map((m) => ({
        treatmentId: m.treatmentId,
        subMix: m.subMixIndex,
        plotCount: m.plotCount,
        water: m.waterVolumeLPerHa,
        overage: m.overageEnabled ? m.overagePct : null,
        products: m.products
          .map((p) => ({
            componentId: p.componentId,
            name: p.productName,
            rate: p.rateValue,
            unit: p.rateUnit
          }))
          .sort((a, b) => (a.componentId ?? 0) - (b.componentId ?? 0))
      }))
      .sort((a, b) => (a.treatmentId ?? 0) - (b.treatmentId ?? 0) || a.subMix - b.subMix),
    mixSettings: s.mixSettings
      .map((m) => ({ t: m.treatmentId, waterIn: m.waterIn, tank: m.tankMixStatus }))
      .sort((a, b) => a.t - b.t)
  }
}

/** Deterministic JSON: objects serialized with sorted keys so hashes are stable. */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort)
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, val]) => [k, sort(val)])
      )
    }
    return v
  }
  return JSON.stringify(sort(value))
}

// ---------------------------------------------------------------------------
// Two-person rule
// ---------------------------------------------------------------------------
export interface ApprovalCheck {
  ok: boolean
  error?: string
}

/** The approver must be a different identified user than the first checker. */
export function checkTwoPerson(firstCheckerId: number | null, approverId: number): ApprovalCheck {
  if (firstCheckerId == null) return { ok: false, error: 'No first check has been completed' }
  if (firstCheckerId === approverId) {
    return { ok: false, error: 'The approver must be a different person than the first checker' }
  }
  return { ok: true }
}

export function documentRef(trialId: number, eventLabel: string, version: number): string {
  return `ART-${trialId}-${eventLabel}-v${version}`
}
