import { describe, it, expect } from 'vitest'
import {
  canTransition,
  canonicalJson,
  materialSnapshot,
  checkTwoPerson,
  documentRef,
  CALC_ENGINE_VERSION,
  type DocumentSnapshot
} from './approval'
import { calculateMix } from './appcalc'

const snapshot = (overrides: Partial<{ rate: number; operator: string; plannedDate: string; overagePct: number }> = {}): DocumentSnapshot => {
  const mix = calculateMix({
    treatmentId: 21,
    treatmentNumber: 2,
    treatmentName: 'Standard',
    plotAreaM2: 1,
    plotCount: 4,
    waterVolumeLPerHa: 500,
    overageEnabled: (overrides.overagePct ?? 0) > 0,
    overagePct: overrides.overagePct ?? 0,
    products: [
      {
        componentId: 1,
        productName: 'Product A',
        physicalForm: 'liquid',
        rateValue: overrides.rate ?? 1,
        rateUnit: 'L/ha'
      }
    ]
  })
  return {
    calcEngineVersion: CALC_ENGINE_VERSION,
    trial: {
      id: 12,
      siteName: 'Site',
      location: '',
      protocolTitle: 'P',
      protocolUid: 'uid',
      crop: 'turf',
      investigator: overrides.operator ?? 'inv' // non-material field for the hash test
    },
    event: { id: 100, label: 'C', plannedDate: overrides.plannedDate ?? '2026-04-15' },
    plotAreaM2: 1,
    mixes: [mix],
    mixSettings: [{ treatmentId: 21, waterIn: false, tankMixStatus: 'unconfirmed' }]
  }
}

const hashOf = (s: DocumentSnapshot): string => canonicalJson(materialSnapshot(s))

describe('status transitions', () => {
  it('allows the legal flow', () => {
    expect(canTransition('draft', 'awaiting_approval')).toBe(true)
    expect(canTransition('awaiting_approval', 'approved')).toBe(true)
    expect(canTransition('awaiting_approval', 'returned')).toBe(true)
    expect(canTransition('awaiting_approval', 'draft')).toBe(true) // withdraw
    expect(canTransition('returned', 'awaiting_approval')).toBe(true)
    expect(canTransition('approved', 'superseded')).toBe(true)
  })
  it('rejects illegal jumps', () => {
    expect(canTransition('draft', 'approved')).toBe(false)
    expect(canTransition('approved', 'awaiting_approval')).toBe(false)
    expect(canTransition('superseded', 'approved')).toBe(false)
  })
})

describe('material snapshot hashing', () => {
  it('is stable for identical inputs (deterministic canonical JSON)', () => {
    expect(hashOf(snapshot())).toBe(hashOf(snapshot()))
  })

  it('changes when a rate changes (material)', () => {
    expect(hashOf(snapshot())).not.toBe(hashOf(snapshot({ rate: 1.5 })))
  })

  it('changes when the planned date changes (material)', () => {
    expect(hashOf(snapshot())).not.toBe(hashOf(snapshot({ plannedDate: '2026-04-16' })))
  })

  it('changes when overage changes (material)', () => {
    expect(hashOf(snapshot())).not.toBe(hashOf(snapshot({ overagePct: 10 })))
  })

  it('does NOT change for non-material completion details', () => {
    // Investigator/operator-style display fields are not part of the material subset.
    expect(hashOf(snapshot())).toBe(hashOf(snapshot({ operator: 'someone else' })))
  })

  it('canonicalJson sorts keys so property order is irrelevant', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
  })
})

describe('two-person rule', () => {
  it('rejects self-approval', () => {
    expect(checkTwoPerson(5, 5).ok).toBe(false)
  })
  it('rejects approval without a first check', () => {
    expect(checkTwoPerson(null, 5).ok).toBe(false)
  })
  it('accepts two distinct users', () => {
    expect(checkTwoPerson(5, 6).ok).toBe(true)
  })
})

describe('documentRef', () => {
  it('formats trial, label and version', () => {
    expect(documentRef(12, 'C', 2)).toBe('ART-12-C-v2')
  })
})
