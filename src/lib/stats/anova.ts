import jStat from 'jstat'
import type { AovRequest, AovAnovaRow, AovResult, TreatmentMean } from '@shared/types'

/**
 * JavaScript ANOVA engine (replaces the original Electron app's R + agricolae backend).
 *
 * Supported exactly: RCB (two-way: treatment + rep/block) and CRD (one-way: treatment only).
 * Mean-separation tests:
 *  - LSD (Fisher): exact, Student's t critical difference.
 *  - TUKEY (HSD): exact, via jStat's studentized-range quantile (`tukey.inv`).
 *  - SNK (Student-Newman-Keuls): the stepwise studentized-range test, using `tukey.inv` with the
 *    number of means spanned by each comparison — this is the real SNK procedure, not a fallback.
 *  - DUNCAN: Duncan's Multiple Range Test needs Duncan's empirical "shortest significant ranges"
 *    tables, which have no closed-form distribution and aren't available in jStat. There's no
 *    principled way to compute it here, so it falls back to the LSD critical value; the label and
 *    `note` make the approximation explicit rather than silently mislabeling it as Duncan's test.
 * ALPHA (incomplete-block/resolvable) designs need a REML/mixed-model fit (the original used R's
 * `agricolae::PBIB.test`); that's out of scope for this engine, so it returns a `note` instead of a
 * result.
 */

const MIN_OBSERVATIONS = 3

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function sumSq(xs: number[]): number {
  return xs.reduce((a, b) => a + b * b, 0)
}

function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const r of rows) {
    const k = key(r)
    const arr = m.get(k)
    if (arr) arr.push(r)
    else m.set(k, [r])
  }
  return m
}

/** Excel-style base-26 letters: 0->a, 1->b, ..., 25->z, 26->aa, 27->ab, ... */
function letterFor(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(97 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function emptyResult(req: AovRequest, note: string): AovResult {
  return {
    anova: [],
    means: [],
    grandMean: NaN,
    cv: NaN,
    lsd: null,
    criticalValueLabel: '',
    stdError: NaN,
    test: req.test,
    alpha: req.alpha,
    significant: false,
    note
  }
}

interface RawMean {
  treatment: number
  mean: number
  n: number
  std: number
}

/**
 * Assign mean-separation letters using the standard "overlapping runs" compact-letter-display
 * algorithm: sort means descending, then for every starting rank i extend a new letter group to the
 * farthest rank j such that the two extreme means (i and j) are not significantly different. Because
 * `critFn` may depend on the number of means spanned (SNK), this is checked at each step rather than
 * assuming a single constant critical value.
 */
function assignLetters(sorted: RawMean[], critFn: (span: number) => number): Map<number, string> {
  const n = sorted.length
  const letters = new Map<number, string>()
  for (const m of sorted) letters.set(m.treatment, '')
  let nextLetter = 0
  for (let i = 0; i < n; i++) {
    let j = i
    while (j + 1 < n && sorted[i].mean - sorted[j + 1].mean <= critFn(j + 1 - i + 1)) {
      j++
    }
    const letter = letterFor(nextLetter++)
    for (let k = i; k <= j; k++) {
      letters.set(sorted[k].treatment, (letters.get(sorted[k].treatment) ?? '') + letter)
    }
  }
  return letters
}

interface MeanSeparation {
  critical: number
  label: string
  letters: Map<number, string>
}

/**
 * Note: `AovResult.note` means "the data is too degenerate to show a result at all" (the UI hides
 * the tables and shows the note instead) — it is NOT used here for the Duncan approximation, since
 * that result is perfectly valid and should still be displayed. The approximation is instead signalled
 * through the `LSD*` critical-value label; callers (StatsView/ReportView) add a one-line caveat next
 * to the test selector when `test === 'DUNCAN'`.
 */
function meanSeparation(
  req: Pick<AovRequest, 'test' | 'alpha'>,
  meansRaw: RawMean[],
  msError: number,
  dfError: number
): MeanSeparation {
  const k = meansRaw.length
  const nHarm = k / meansRaw.reduce((s, m) => s + 1 / m.n, 0)
  const seDiff = Math.sqrt((2 * msError) / nHarm) // SE of a difference between two means
  const seMean = Math.sqrt(msError / nHarm) // SE of a single mean (used by the range tests)
  const sorted = [...meansRaw].sort((a, b) => b.mean - a.mean)

  let critFn: (span: number) => number
  let label: string
  let critical: number

  switch (req.test) {
    case 'TUKEY': {
      const q = jStat.tukey.inv(1 - req.alpha, k, dfError)
      critical = q * seMean
      critFn = () => critical
      label = `HSD (${req.alpha})`
      break
    }
    case 'SNK': {
      critFn = (span) => jStat.tukey.inv(1 - req.alpha, Math.max(span, 2), dfError) * seMean
      critical = critFn(2)
      label = `SNK (${req.alpha})`
      break
    }
    case 'DUNCAN': {
      const t = jStat.studentt.inv(1 - req.alpha / 2, dfError)
      critical = t * seDiff
      critFn = () => critical
      label = `LSD* (${req.alpha})`
      break
    }
    case 'LSD':
    default: {
      const t = jStat.studentt.inv(1 - req.alpha / 2, dfError)
      critical = t * seDiff
      critFn = () => critical
      label = `LSD (${req.alpha})`
      break
    }
  }

  const letters = assignLetters(sorted, critFn)
  return { critical, label, letters }
}

export function runAnova(req: AovRequest): AovResult {
  if (req.design === 'ALPHA') {
    return emptyResult(
      req,
      'Incomplete-block (alpha) design analysis requires a REML/mixed-model fit (PBIB) that this JavaScript statistics engine does not implement yet.'
    )
  }

  const data = req.data
  if (data.length < MIN_OBSERVATIONS) {
    return emptyResult(req, 'Not enough observations for analysis.')
  }

  const treatments = [...new Set(data.map((d) => d.treatment))].sort((a, b) => a - b)
  const N = data.length
  const grandMean = mean(data.map((d) => d.value))
  const ssTotal = sumSq(data.map((d) => d.value - grandMean))
  const dfTotal = N - 1

  const byTrt = groupBy(data, (d) => d.treatment)
  let ssTreatment = 0
  for (const rows of byTrt.values()) {
    const m = mean(rows.map((r) => r.value))
    ssTreatment += rows.length * (m - grandMean) ** 2
  }
  const dfTreatment = treatments.length - 1

  let ssBlock = 0
  let dfBlock = 0
  if (req.design === 'RCB') {
    const byRep = groupBy(data, (d) => d.rep)
    const reps = [...byRep.keys()]
    for (const rows of byRep.values()) {
      const m = mean(rows.map((r) => r.value))
      ssBlock += rows.length * (m - grandMean) ** 2
    }
    dfBlock = reps.length - 1
  }

  const ssError = ssTotal - ssTreatment - ssBlock
  const dfError = dfTotal - dfTreatment - dfBlock

  if (dfError <= 0 || ssError < 0) {
    return emptyResult(
      req,
      'Insufficient residual degrees of freedom for this design and data — check replication and missing/excluded plots.'
    )
  }

  const msTreatment = ssTreatment / dfTreatment
  const msError = ssError / dfError
  const fTreatment = msError > 0 ? msTreatment / msError : NaN
  const pTreatment =
    msError > 0 && Number.isFinite(fTreatment) ? 1 - jStat.centralF.cdf(fTreatment, dfTreatment, dfError) : null

  const anova: AovAnovaRow[] = []
  anova.push({ source: 'treatment', df: dfTreatment, ss: ssTreatment, ms: msTreatment, f: fTreatment, pValue: pTreatment })
  if (req.design === 'RCB') {
    const msBlock = ssBlock / dfBlock
    const fBlock = msError > 0 ? msBlock / msError : NaN
    const pBlock =
      msError > 0 && Number.isFinite(fBlock) ? 1 - jStat.centralF.cdf(fBlock, dfBlock, dfError) : null
    anova.push({ source: 'block', df: dfBlock, ss: ssBlock, ms: msBlock, f: fBlock, pValue: pBlock })
  }
  anova.push({ source: 'error', df: dfError, ss: ssError, ms: msError, f: null, pValue: null })
  anova.push({ source: 'total', df: dfTotal, ss: ssTotal, ms: null, f: null, pValue: null })

  const meansRaw: RawMean[] = treatments.map((t) => {
    const rows = byTrt.get(t)!
    const m = mean(rows.map((r) => r.value))
    const std = rows.length > 1 ? Math.sqrt(sumSq(rows.map((r) => r.value - m)) / (rows.length - 1)) : NaN
    return { treatment: t, mean: m, n: rows.length, std }
  })

  const { critical, label, letters } = meanSeparation(req, meansRaw, msError, dfError)
  const means: TreatmentMean[] = meansRaw.map((m) => ({ ...m, group: letters.get(m.treatment) ?? '' }))

  const nHarm = treatments.length / meansRaw.reduce((s, m) => s + 1 / m.n, 0)
  const stdError = Math.sqrt(msError / nHarm)
  const cv = grandMean !== 0 ? (Math.sqrt(msError) / Math.abs(grandMean)) * 100 : NaN
  const significant = pTreatment !== null && Number.isFinite(pTreatment) ? pTreatment < req.alpha : false

  return {
    anova,
    means,
    grandMean,
    cv,
    lsd: critical,
    criticalValueLabel: label,
    stdError,
    test: req.test,
    alpha: req.alpha,
    significant
  }
}
