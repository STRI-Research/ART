import { describe, it, expect } from 'vitest'
import { validateDesign, canSwapTreatments, defaultCols } from './design.js'

describe('validateDesign', () => {
  it('accepts RCB/CRD with >= 2 treatments and >= 2 replicates', () => {
    expect(validateDesign('RCB', 4, 0, 6).ok).toBe(true)
    expect(validateDesign('CRD', 3, 0, 5).ok).toBe(true)
  })

  it('rejects too few treatments or replicates', () => {
    expect(validateDesign('RCB', 1, 0, 6).ok).toBe(false)
    expect(validateDesign('RCB', 4, 0, 1).ok).toBe(false)
  })

  it('rejects an alpha block size below 3', () => {
    const v = validateDesign('ALPHA', 2, 2, 6)
    expect(v.ok).toBe(false)
    expect(v.error).toMatch(/at least 3/i)
  })

  it('requires the block size to divide the treatment count', () => {
    expect(validateDesign('ALPHA', 2, 4, 10).ok).toBe(false) // 10 % 4 != 0
  })

  it('requires at least k blocks per replicate (k <= sqrt t)', () => {
    const v = validateDesign('ALPHA', 2, 3, 6) // t=6, k=3 -> s=2 < k
    expect(v.ok).toBe(false)
    expect(v.error).toMatch(/blocks per replicate|at most/i)
  })

  it('validates replicate availability and reports the valid counts', () => {
    // t=16, k=4, s=4 -> only r=2 is available
    const bad = validateDesign('ALPHA', 3, 4, 16)
    expect(bad.ok).toBe(false)
    expect(bad.validReplicates).toEqual([2])
    expect(bad.error).toMatch(/2 replicates/)
    expect(validateDesign('ALPHA', 2, 4, 16).ok).toBe(true)

    // t=9, k=3, s=3 (odd) -> r=2,3 valid; r=4 not
    expect(validateDesign('ALPHA', 2, 3, 9).ok).toBe(true)
    expect(validateDesign('ALPHA', 3, 3, 9).ok).toBe(true)
    expect(validateDesign('ALPHA', 4, 3, 9).ok).toBe(false)

    // t=15, k=3, s=5 (gcd(5,6)=1) -> r=4 valid
    expect(validateDesign('ALPHA', 4, 3, 15).ok).toBe(true)
  })
})

describe('canSwapTreatments', () => {
  it('CRD allows any swap (no blocking)', () => {
    expect(canSwapTreatments('CRD', { rep: 1, block: 1 }, { rep: 3, block: 3 })).toBe(true)
  })
  it('RCB requires the same rep', () => {
    expect(canSwapTreatments('RCB', { rep: 2, block: 2 }, { rep: 2, block: 2 })).toBe(true)
    expect(canSwapTreatments('RCB', { rep: 1, block: 1 }, { rep: 2, block: 2 })).toBe(false)
  })
  it('ALPHA requires the same rep and block', () => {
    expect(canSwapTreatments('ALPHA', { rep: 1, block: 2 }, { rep: 1, block: 2 })).toBe(true)
    expect(canSwapTreatments('ALPHA', { rep: 1, block: 1 }, { rep: 1, block: 2 })).toBe(false) // cross-block
    expect(canSwapTreatments('ALPHA', { rep: 1, block: 1 }, { rep: 2, block: 1 })).toBe(false) // cross-rep
  })
})

describe('defaultCols', () => {
  it('is the treatment count for RCB/CRD and the block size for ALPHA', () => {
    expect(defaultCols('RCB', 3, 8)).toBe(8)
    expect(defaultCols('CRD', 3, 5)).toBe(5)
    expect(defaultCols('ALPHA', 3, 9)).toBe(3)
  })
})
