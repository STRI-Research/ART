'use client'

import { useEffect, useMemo, useState } from 'react'
import { api, type TrialSnapshot } from '@/lib/api'
import { toProjectSnapshot } from '@/lib/snapshot'
import { buildObservations } from '@/lib/stats/buildData'
import { AnovaTable } from './AnovaTable'
import { MeansTable } from './MeansTable'
import type { MeanComparisonTest, AlphaLevel, AovResult } from '@shared/types'

export const TESTS: { id: MeanComparisonTest; label: string }[] = [
  { id: 'LSD', label: "Fisher's LSD" },
  { id: 'TUKEY', label: "Tukey's HSD" },
  { id: 'DUNCAN', label: "Duncan's MRT" },
  { id: 'SNK', label: 'Student-Newman-Keuls' }
]

const MIN_OBS = 3

export function StatsView({
  trialId,
  onOpenReport
}: {
  trialId: number
  onOpenReport?: () => void
}) {
  const [snap, setSnap] = useState<TrialSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [headerId, setHeaderId] = useState<number | null>(null)
  const [test, setTest] = useState<MeanComparisonTest>('LSD')
  const [alpha, setAlpha] = useState<AlphaLevel>(0.05)
  const [results, setResults] = useState<Record<number, AovResult>>({})
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.trials.get(trialId).then((s) => {
      if (cancelled) return
      setSnap(s)
      const headers = s.measurementHeaders.filter((h) => h.analyze)
      setHeaderId((prev) => prev ?? headers[0]?.id ?? null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [trialId])

  const headers = useMemo(() => (snap ? snap.measurementHeaders.filter((h) => h.analyze) : []), [snap])
  const obs = useMemo(
    () => (snap && headerId != null ? buildObservations(toProjectSnapshot(snap), headerId) : []),
    [snap, headerId]
  )

  const runAnalysis = async () => {
    if (!headerId || !snap) return
    setRunning(true)
    setError(null)
    try {
      const isAlpha = snap.protocol.design === 'ALPHA'
      const result = await api.stats.runAov(trialId, headerId, {
        design: snap.protocol.design,
        test,
        alpha,
        blockSize: isAlpha ? snap.protocol.blockSize : undefined,
        data: obs
      })
      setResults((prev) => ({ ...prev, [headerId]: result }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setRunning(false)
    }
  }

  if (loading || !snap) {
    return (
      <div className="card">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  const isAlpha = snap.protocol.design === 'ALPHA'
  const result = headerId != null ? (results[headerId] ?? null) : null

  return (
    <>
      <div className="card">
        <h2>Statistics</h2>
        {headers.length === 0 ? (
          <p className="muted">Define a measurement column and enter data first.</p>
        ) : (
          <div className="row">
            <div style={{ minWidth: 220 }}>
              <label>Measurement</label>
              <select value={headerId ?? ''} onChange={(e) => setHeaderId(Number(e.target.value))}>
                {headers.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.description || h.measurementType || `Measurement ${h.ordinal + 1}`}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ width: 190 }}>
              <label>Mean comparison</label>
              <select value={test} onChange={(e) => setTest(e.target.value as MeanComparisonTest)}>
                {TESTS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ width: 110 }}>
              <label>Alpha</label>
              <select value={alpha} onChange={(e) => setAlpha(Number(e.target.value) as AlphaLevel)}>
                <option value={0.01}>0.01</option>
                <option value={0.05}>0.05</option>
                <option value={0.1}>0.10</option>
              </select>
            </div>
            <button className="primary" disabled={running || obs.length < MIN_OBS} onClick={runAnalysis}>
              {running ? 'Running…' : 'Run Analysis'}
            </button>
            <span className="muted">{obs.length} observations</span>
          </div>
        )}
        {isAlpha && headers.length > 0 && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Incomplete-block (alpha) design: this JavaScript statistics engine doesn't yet implement the
            REML/PBIB fit these designs need — analysis will return a note instead of a result.
          </p>
        )}
        {!isAlpha && test === 'DUNCAN' && headers.length > 0 && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Duncan's Multiple Range Test isn't implemented — Fisher's LSD grouping is shown instead
            (critical value labelled "LSD*").
          </p>
        )}
        {error && (
          <p style={{ color: 'var(--danger)', marginBottom: 0 }}>{error}</p>
        )}
      </div>

      {result?.note ? (
        <div className="card">
          <div className="banner">{result.note}</div>
        </div>
      ) : (
        result && (
          <>
            <div className="card">
              <h2>Analysis of Variance</h2>
              <AnovaTable result={result} />
            </div>

            <div className="card">
              <h2>Treatment Means</h2>
              <MeansTable result={result} treatments={snap.treatments} />
            </div>
            {onOpenReport && (
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="primary" onClick={onOpenReport}>
                  Open full report →
                </button>
              </div>
            )}
          </>
        )
      )}
    </>
  )
}
