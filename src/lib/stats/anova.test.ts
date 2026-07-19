import { describe, it, expect } from 'vitest'
import { runAnova } from './anova'
import type { AovRequest } from '@shared/types'

/** Build RCB long-form data: `perTreatment` gives each treatment's value in each rep. */
function rcb(perTreatment: Record<number, number[]>): AovRequest['data'] {
  const out: AovRequest['data'] = []
  for (const [t, vals] of Object.entries(perTreatment)) {
    vals.forEach((value, i) => out.push({ treatment: Number(t), rep: i + 1, block: i + 1, value }))
  }
  return out
}

describe('compact letter display', () => {
  it('does not proliferate letters — two clear groups get a and b, nothing more', () => {
    // T3 ~2 (low), T1/T2 ~10 (high). Expect: T3 = "a", T1 = T2 = "b". No c/d/e.
    const data = rcb({
      1: [10.1, 9.9, 10.2, 9.8],
      2: [10.0, 10.1, 9.9, 10.0],
      3: [2.1, 1.9, 2.0, 2.0],
    })
    const res = runAnova({ design: 'RCB', test: 'LSD', alpha: 0.05, data })
    const g = (t: number) => res.means.find((m) => m.treatment === t)!.group
    expect(g(3)).toBe('a')
    expect(g(1)).toBe('b')
    expect(g(2)).toBe('b')
    const distinct = new Set(res.means.flatMap((m) => m.group.split('')))
    expect(distinct.size).toBe(2) // only a and b, no runaway lettering
  })

  it('gives every treatment the same letter when none differ significantly', () => {
    const data = rcb({
      1: [5.0, 5.1, 4.9, 5.0],
      2: [5.1, 5.0, 5.0, 4.9],
      3: [4.9, 5.0, 5.1, 5.0],
    })
    const res = runAnova({ design: 'RCB', test: 'LSD', alpha: 0.05, data })
    for (const m of res.means) expect(m.group).toBe('a')
  })

  it('letters ascending: the smallest mean is "a"', () => {
    const data = rcb({
      1: [1.0, 1.1, 0.9, 1.0], // lowest
      2: [5.0, 5.1, 4.9, 5.0],
      3: [9.0, 9.1, 8.9, 9.0], // highest
    })
    const res = runAnova({ design: 'RCB', test: 'LSD', alpha: 0.05, data })
    expect(res.means.find((m) => m.treatment === 1)!.group).toBe('a')
    expect(res.means.find((m) => m.treatment === 3)!.group).toContain('c')
  })
})
