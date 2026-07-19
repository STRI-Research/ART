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
 * ALPHA (incomplete-block/resolvable) designs use an intra-block analysis with treatment effects
 * adjusted for incomplete blocks nested within replicates.  The adjusted treatment SS is computed via
 * the Q-method (adjusted treatment totals and the C information matrix), matching the fixed-effects
 * portion of R's `agricolae::PBIB.test`.  Mean separation uses an average effective replication
 * derived from the generalised inverse of C.
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

// ---------------------------------------------------------------------------
// Linear algebra helpers (small dense matrices — fine for typical trial sizes)
// ---------------------------------------------------------------------------

/**
 * Solve A·x = b via Gaussian elimination with partial pivoting.
 * Returns the solution vector, or null if the matrix is (numerically) singular.
 */
function gaussSolve(A: number[][], b: number[]): number[] | null {
  const n = A.length
  const aug: number[][] = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    // partial pivoting
    let best = Math.abs(aug[col][col])
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(aug[row][col])
      if (v > best) { best = v; pivot = row }
    }
    if (best < 1e-12) return null
    if (pivot !== col) [aug[col], aug[pivot]] = [aug[pivot], aug[col]]

    for (let row = col + 1; row < n; row++) {
      const f = aug[row][col] / aug[col][col]
      for (let j = col; j <= n; j++) aug[row][j] -= f * aug[col][j]
    }
  }

  const x = new Array<number>(n)
  for (let i = n - 1; i >= 0; i--) {
    let s = aug[i][n]
    for (let j = i + 1; j < n; j++) s -= aug[i][j] * x[j]
    x[i] = s / aug[i][i]
  }
  return x
}

/**
 * Invert a square matrix via Gauss-Jordan elimination with partial pivoting.
 * Returns the inverse, or null if singular.
 */
function gaussInvert(A: number[][]): number[][] | null {
  const n = A.length
  // Build [A | I]
  const aug: number[][] = A.map((row, i) => {
    const r = [...row]
    for (let j = 0; j < n; j++) r.push(i === j ? 1 : 0)
    return r
  })

  for (let col = 0; col < n; col++) {
    let best = Math.abs(aug[col][col])
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(aug[row][col])
      if (v > best) { best = v; pivot = row }
    }
    if (best < 1e-12) return null
    if (pivot !== col) [aug[col], aug[pivot]] = [aug[pivot], aug[col]]

    const d = aug[col][col]
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= d

    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const f = aug[row][col]
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= f * aug[col][j]
    }
  }

  return aug.map((row) => row.slice(n))
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
 * Assign mean-separation letters (compact letter display). Means are lettered in ascending order so
 * `a` is the smallest mean, matching conventional agronomy reports. For each rank i we extend to the
 * farthest rank j whose mean is not significantly greater than mean[i] — that run [i, j] is a maximal
 * set of mutually non-significant means (a clique). A new letter is emitted only when the run reaches
 * *beyond* the previous letter's run; otherwise the run is already covered and emitting a letter would
 * just proliferate redundant ones. Every treatment then carries the letters of all runs containing it,
 * so any two non-significant means share at least one letter and any two significant means share none.
 * `critFn` may depend on the number of means spanned (SNK), so it is evaluated per step.
 */
function assignLetters(sorted: RawMean[], critFn: (span: number) => number): Map<number, string> {
  const n = sorted.length
  const letters = new Map<number, string>()
  for (const m of sorted) letters.set(m.treatment, '')
  const asc = [...sorted].sort((a, b) => a.mean - b.mean)
  let group = 0
  let prevEnd = -1
  for (let i = 0; i < n; i++) {
    let j = i
    while (j + 1 < n && asc[j + 1].mean - asc[i].mean <= critFn(j + 1 - i + 1)) {
      j++
    }
    if (j > prevEnd) {
      const letter = letterFor(group++)
      for (let k = i; k <= j; k++) {
        letters.set(asc[k].treatment, (letters.get(asc[k].treatment) ?? '') + letter)
      }
      prevEnd = j
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

// ---------------------------------------------------------------------------
// Alpha (incomplete-block) design — intra-block analysis
// ---------------------------------------------------------------------------

/**
 * Intra-block ANOVA for an alpha (resolvable incomplete-block) design.
 *
 * Model: Y_ijk = mu + tau_i + rho_j + beta_k(j) + epsilon_ijk
 *   tau_i    = treatment effect (i = 1..t)
 *   rho_j    = replicate effect (j = 1..r)
 *   beta_k(j)= incomplete-block effect nested within replicate
 *
 * Treatment SS is adjusted for blocks via the Q-method (adjusted treatment totals
 * and the C information matrix).  This matches the fixed-effects intra-block portion
 * of agricolae::PBIB.test.
 */
function alphaAnova(req: AovRequest): AovResult {
  const data = req.data
  if (data.length < MIN_OBSERVATIONS) {
    return emptyResult(req, 'Not enough observations for analysis.')
  }
  if (data.some((d) => d.block == null)) {
    return emptyResult(req, 'Alpha design requires block assignments for all observations.')
  }

  const N = data.length
  const grandTotal = data.reduce((s, d) => s + d.value, 0)
  const GM = grandTotal / N

  const treatments = [...new Set(data.map((d) => d.treatment))].sort((a, b) => a - b)
  const reps = [...new Set(data.map((d) => d.rep))].sort((a, b) => a - b)
  const t = treatments.length
  const r = reps.length

  if (t < 2) return emptyResult(req, 'Need at least 2 treatments for ANOVA.')

  // --- unique block key (rep:block) ---
  const bk = (rep: number, blk: number) => `${rep}:${blk}`
  const allBlockKeys = [...new Set(data.map((d) => bk(d.rep, d.block!)))]
  const numBlocks = allBlockKeys.length

  // --- group data ---
  const byRep = groupBy(data, (d) => d.rep)
  const byBlock = groupBy(data, (d) => bk(d.rep, d.block!))
  const byTrt = groupBy(data, (d) => d.treatment)

  // --- SS total ---
  const ssTotal = data.reduce((s, d) => s + (d.value - GM) ** 2, 0)
  const dfTotal = N - 1

  // --- SS replicate ---
  let ssRep = 0
  const repMeans = new Map<number, number>()
  for (const [rep, rows] of byRep) {
    const m = mean(rows.map((r) => r.value))
    repMeans.set(rep, m)
    ssRep += rows.length * (m - GM) ** 2
  }
  const dfRep = r - 1

  // --- SS block(rep)  =  sum_b n_b*(blockMean_b - repMean)^2 ---
  let ssBlockRep = 0
  for (const rows of byBlock.values()) {
    const rep = rows[0].rep
    const rm = repMeans.get(rep)!
    const bm = mean(rows.map((r) => r.value))
    ssBlockRep += rows.length * (bm - rm) ** 2
  }
  const dfBlockRep = numBlocks - r

  // --- treatment totals ---
  const Ti = treatments.map((tr) => byTrt.get(tr)!.reduce((s, d) => s + d.value, 0))

  // --- block totals & sizes ---
  const blockTotal = new Map<string, number>()
  const blockSize = new Map<string, number>()
  for (const [key, rows] of byBlock) {
    blockTotal.set(key, rows.reduce((s, d) => s + d.value, 0))
    blockSize.set(key, rows.length)
  }

  // --- incidence n_ij: count of treatment i in block j ---
  const nij = new Map<string, number>()
  for (const d of data) {
    const key = `${d.treatment}|${bk(d.rep, d.block!)}`
    nij.set(key, (nij.get(key) || 0) + 1)
  }
  const getNij = (tr: number, block: string) => nij.get(`${tr}|${block}`) || 0

  // --- Q vector (adjusted treatment totals) ---
  // Q_i = T_i - sum_j [ n_ij * B_j / k_j ]
  const Q = treatments.map((tr, i) => {
    let adj = 0
    for (const bkey of allBlockKeys) {
      const n = getNij(tr, bkey)
      if (n > 0) adj += (n * blockTotal.get(bkey)!) / blockSize.get(bkey)!
    }
    return Ti[i] - adj
  })

  // --- C matrix (information matrix for treatments adjusted for blocks) ---
  // C_ii = r_i - sum_j(n_ij^2 / k_j)
  // C_ij = - sum_b(n_ib * n_jb / k_b)   (i != j)
  const C: number[][] = Array.from({ length: t }, () => Array(t).fill(0))
  for (let i = 0; i < t; i++) {
    for (let j = i; j < t; j++) {
      let v = 0
      for (const bkey of allBlockKeys) {
        v += (getNij(treatments[i], bkey) * getNij(treatments[j], bkey)) / blockSize.get(bkey)!
      }
      if (i === j) {
        C[i][j] = byTrt.get(treatments[i])!.length - v
      } else {
        C[i][j] = -v
        C[j][i] = -v
      }
    }
  }

  // --- solve for treatment effects (reduced system, last treatment = 0) ---
  const sz = t - 1
  const C11 = Array.from({ length: sz }, (_, i) => Array.from({ length: sz }, (_, j) => C[i][j]))
  const Qr = Q.slice(0, sz)

  const tauReduced = gaussSolve(C11, Qr)
  if (!tauReduced) {
    return emptyResult(req, 'Design matrix is singular — the incomplete-block design may be disconnected.')
  }
  // tau with reference constraint (last = 0)
  const tauRef = [...tauReduced, 0]

  // --- SS treatment (adjusted) = Q' * tau ---
  let ssTrtAdj = 0
  for (let i = 0; i < t; i++) ssTrtAdj += Q[i] * tauRef[i]
  if (ssTrtAdj < 0) ssTrtAdj = 0 // numerical guard
  const dfTrt = t - 1

  // --- error ---
  const dfError = dfTotal - dfRep - dfBlockRep - dfTrt // = N - numBlocks - t + 1
  if (dfError <= 0) {
    return emptyResult(
      req,
      'Insufficient residual degrees of freedom for this design and data — check replication and missing/excluded plots.'
    )
  }
  let ssError = ssTotal - ssRep - ssBlockRep - ssTrtAdj
  if (ssError < -1e-6 * Math.max(ssTotal, 1)) {
    return emptyResult(req, 'Negative error sum of squares — data may not match an incomplete-block layout.')
  }
  ssError = Math.max(0, ssError)

  const msTrt = ssTrtAdj / dfTrt
  const msError = ssError / dfError
  const fTrt = msError > 0 ? msTrt / msError : NaN
  const pTrt =
    msError > 0 && Number.isFinite(fTrt) ? 1 - jStat.centralF.cdf(fTrt, dfTrt, dfError) : null

  const msRep = dfRep > 0 ? ssRep / dfRep : 0
  const fRep = msError > 0 && dfRep > 0 ? msRep / msError : NaN
  const pRep =
    msError > 0 && Number.isFinite(fRep) && dfRep > 0
      ? 1 - jStat.centralF.cdf(fRep, dfRep, dfError)
      : null

  const msBlockRep = dfBlockRep > 0 ? ssBlockRep / dfBlockRep : 0

  const anova: AovAnovaRow[] = [
    { source: 'replicate', df: dfRep, ss: ssRep, ms: msRep, f: fRep, pValue: pRep },
    { source: 'block(rep)', df: dfBlockRep, ss: ssBlockRep, ms: msBlockRep, f: null, pValue: null },
    { source: 'treatment', df: dfTrt, ss: ssTrtAdj, ms: msTrt, f: fTrt, pValue: pTrt },
    { source: 'error', df: dfError, ss: ssError, ms: msError, f: null, pValue: null },
    { source: 'total', df: dfTotal, ss: ssTotal, ms: null, f: null, pValue: null }
  ]

  // --- adjusted treatment means ---
  // Centre tau so sum(tau) = 0 → adj_mean_i = GM + tau_centred_i
  const tauMean = tauRef.reduce((s, v) => s + v, 0) / t
  const tauC = tauRef.map((v) => v - tauMean)

  // --- effective replication for mean separation ---
  // Var(tau_i - tau_j) = MSE * (c^ii + c^jj - 2 c^ij) using the g-inverse with tau_t=0
  // (the variance-of-a-difference is invariant to the choice of g-inverse).
  // We compute the average variance factor across all treatment pairs and derive a
  // single effective n so the existing meanSeparation machinery can be reused.
  let nEff: number
  const C11inv = gaussInvert(C11)
  if (C11inv) {
    let sumV = 0
    let pairs = 0
    for (let i = 0; i < t; i++) {
      for (let j = i + 1; j < t; j++) {
        const cii = i < sz ? C11inv[i][i] : 0
        const cjj = j < sz ? C11inv[j][j] : 0
        const cij = i < sz && j < sz ? C11inv[i][j] : 0
        sumV += cii + cjj - 2 * cij
        pairs++
      }
    }
    const Vavg = sumV / pairs
    nEff = Vavg > 1e-14 ? 2 / Vavg : byTrt.get(treatments[0])!.length
  } else {
    // Fallback: harmonic mean of actual replications
    nEff = t / treatments.reduce((s, tr) => s + 1 / byTrt.get(tr)!.length, 0)
  }

  // Build RawMean with adjusted means and effective n for separation
  const adjForSep: RawMean[] = treatments.map((tr, i) => ({
    treatment: tr,
    mean: GM + tauC[i],
    n: nEff,
    std: 0
  }))

  const { critical, label, letters } = meanSeparation(req, adjForSep, msError, dfError)

  // Final TreatmentMean array (actual n and std for display, adjusted means for ranking)
  const means: TreatmentMean[] = treatments.map((tr, i) => {
    const rows = byTrt.get(tr)!
    const rawMean = mean(rows.map((r) => r.value))
    const std =
      rows.length > 1 ? Math.sqrt(sumSq(rows.map((r) => r.value - rawMean)) / (rows.length - 1)) : NaN
    return { treatment: tr, mean: GM + tauC[i], n: rows.length, std, group: letters.get(tr) ?? '' }
  })

  const stdError = Math.sqrt(msError / nEff)
  const cv = GM !== 0 ? (Math.sqrt(msError) / Math.abs(GM)) * 100 : NaN
  const significant = pTrt !== null && Number.isFinite(pTrt) ? pTrt < req.alpha : false

  return {
    anova,
    means,
    grandMean: GM,
    cv,
    lsd: critical,
    criticalValueLabel: label,
    stdError,
    test: req.test,
    alpha: req.alpha,
    significant
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function runAnova(req: AovRequest): AovResult {
  if (req.design === 'ALPHA') return alphaAnova(req)

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
