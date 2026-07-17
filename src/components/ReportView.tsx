'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type TrialSnapshot } from '@/lib/api'
import { toProjectSnapshot } from '@/lib/snapshot'
import { buildObservations, type Observation } from '@/lib/stats/buildData'
import { AnovaTable } from './AnovaTable'
import { MeansTable } from './MeansTable'
import { TESTS } from './StatsView'
import type {
  MeasurementHeader,
  MeanComparisonTest,
  AlphaLevel,
  AovResult,
  TreatmentMean,
  Treatment
} from '@shared/types'

const MIN_OBS = 3 // ANOVA needs at least a few observations to be meaningful

function headerTitle(h: MeasurementHeader): string {
  return h.description || h.measurementType || `Measurement ${h.ordinal + 1}`
}

/** Event metadata recorded at data entry: when the measurement was performed, by whom, and the
 *  crop growth stage observed. Renders only the fields that were filled in. */
function MeasurementMeta({ h }: { h: MeasurementHeader }) {
  const parts: string[] = []
  if (h.measurementDate) parts.push(h.measurementDate)
  if (h.growthStage) parts.push(`Growth stage ${h.growthStage}`)
  if (h.assessedBy) parts.push(`by ${h.assessedBy}`)
  if (parts.length === 0) return null
  return (
    <p className="muted" style={{ marginTop: 0 }}>
      {parts.join(' · ')}
    </p>
  )
}

/** Simple single-hue bar chart with error bars (± std dev) and mean-separation letters, in inline
 *  SVG — no charting library. Treatments are ordered by number so repeated views don't reshuffle. */
function MeansBarChart({ means, treatments }: { means: TreatmentMean[]; treatments: Treatment[] }) {
  const nameByNumber = new Map(treatments.map((t) => [t.number, t.name || `T${t.number}`]))
  const data = [...means].sort((a, b) => a.treatment - b.treatment)
  if (data.length === 0) return null

  const maxVal = Math.max(...data.map((d) => d.mean + (Number.isFinite(d.std) ? d.std : 0)), 0.0001)
  const marginTop = 26
  const marginBottom = 46
  const marginLeft = 46
  const marginRight = 12
  const barSlot = 68
  const width = marginLeft + marginRight + data.length * barSlot
  const height = 220
  const plotH = height - marginTop - marginBottom
  const y = (v: number) => marginTop + plotH - (v / maxVal) * plotH

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ maxWidth: width, display: 'block' }}
      role="img"
      aria-label="Treatment means with error bars"
    >
      {[0, maxVal / 2, maxVal].map((t, i) => (
        <g key={i}>
          <line
            x1={marginLeft}
            x2={width - marginRight}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--border)"
            strokeWidth={i === 0 ? 1 : 0.5}
            strokeDasharray={i === 0 ? undefined : '2,2'}
          />
          <text x={marginLeft - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--muted)">
            {t.toFixed(1)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = marginLeft + i * barSlot + barSlot / 2
        const barWidth = Math.min(barSlot * 0.5, 42)
        const top = y(d.mean)
        const hasErr = Number.isFinite(d.std) && d.std > 0
        const errTop = hasErr ? y(d.mean + d.std) : top
        const errBottom = hasErr ? y(Math.max(0, d.mean - d.std)) : top
        return (
          <g key={d.treatment}>
            <title>
              {`${nameByNumber.get(d.treatment) ?? 'T' + d.treatment}: ${d.mean.toFixed(3)} ± ${
                hasErr ? d.std.toFixed(3) : '—'
              } (group ${d.group})`}
            </title>
            <rect x={cx - barWidth / 2} y={top} width={barWidth} height={Math.max(0, y(0) - top)} rx={3} fill="var(--accent)" />
            {hasErr && (
              <>
                <line x1={cx} x2={cx} y1={errTop} y2={errBottom} stroke="var(--text)" strokeWidth={1.5} />
                <line x1={cx - 6} x2={cx + 6} y1={errTop} y2={errTop} stroke="var(--text)" strokeWidth={1.5} />
                <line x1={cx - 6} x2={cx + 6} y1={errBottom} y2={errBottom} stroke="var(--text)" strokeWidth={1.5} />
              </>
            )}
            <text x={cx} y={top - 6} textAnchor="middle" fontSize={11} fill="var(--text)">
              {d.group}
            </text>
            <text x={cx} y={height - marginBottom + 16} textAnchor="middle" fontSize={10} fill="var(--muted)">
              T{d.treatment}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function ReportView({ trialId }: { trialId: number }) {
  const [snap, setSnap] = useState<TrialSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [test, setTest] = useState<MeanComparisonTest>('LSD')
  const [alpha, setAlpha] = useState<AlphaLevel>(0.05)
  const [results, setResults] = useState<Record<number, AovResult>>({})
  const [analyzing, setAnalyzing] = useState(false)
  const generatedAt = useMemo(() => new Date().toLocaleDateString(), [])

  useEffect(() => {
    let cancelled = false
    api.trials.get(trialId).then((s) => {
      if (cancelled) return
      setSnap(s)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [trialId])

  const analyzed = useMemo(() => (snap ? snap.measurementHeaders.filter((h) => h.analyze) : []), [snap])
  const excludedHeaders = useMemo(() => (snap ? snap.measurementHeaders.filter((h) => !h.analyze) : []), [snap])

  const obsByHeader = useMemo(() => {
    const m = new Map<number, Observation[]>()
    if (!snap) return m
    const ps = toProjectSnapshot(snap)
    for (const h of analyzed) m.set(h.id!, buildObservations(ps, h.id!))
    return m
  }, [snap, analyzed])

  // Auto-run: analyze every eligible measurement when the trial loads and whenever test/alpha change.
  const runKey = `${trialId}|${test}|${alpha}`
  const ranFor = useRef<string>('')
  useEffect(() => {
    if (!snap || ranFor.current === runKey) return
    const eligible = analyzed.filter((h) => (obsByHeader.get(h.id!)?.length ?? 0) >= MIN_OBS)
    ranFor.current = runKey
    if (eligible.length === 0) return
    let cancelled = false
    setAnalyzing(true)
    const isAlpha = snap.protocol.design === 'ALPHA'
    ;(async () => {
      const next: Record<number, AovResult> = {}
      for (const h of eligible) {
        try {
          next[h.id!] = await api.stats.runAov(trialId, h.id!, {
            design: snap.protocol.design,
            test,
            alpha,
            blockSize: isAlpha ? snap.protocol.blockSize : undefined,
            data: obsByHeader.get(h.id!)!
          })
        } catch (e) {
          // Don't let one problematic measurement abort the whole report.
          next[h.id!] = {
            anova: [],
            means: [],
            grandMean: 0,
            cv: 0,
            lsd: null,
            criticalValueLabel: '',
            stdError: 0,
            test,
            alpha,
            significant: false,
            note: `Analysis failed: ${e instanceof Error ? e.message : 'unknown error'}`
          }
        }
      }
      if (!cancelled) {
        setResults((prev) => ({ ...prev, ...next }))
        setAnalyzing(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [runKey, snap, analyzed, obsByHeader, trialId, test, alpha])

  if (loading || !snap) {
    return (
      <div className="card">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  const protocol = snap.protocol
  const trial = snap.trial

  const overview = analyzed.map((h) => {
    const result = results[h.id!]
    const n = obsByHeader.get(h.id!)?.length ?? 0
    const trtRow = result?.anova.find((r) => r.source === 'treatment')
    return { h, result, n, pValue: trtRow?.pValue ?? null }
  })
  const anyResults = overview.some((o) => o.result)

  const nameByNumber = new Map(snap.treatments.map((t) => [t.number, t.name || `Trt ${t.number}`]))

  const exportCsv = (): void => {
    const rows: (string | number)[][] = [
      ['measurement', 'treatment_number', 'treatment_name', 'mean', 'group', 'n', 'std']
    ]
    for (const { h, result } of overview) {
      if (!result) continue
      for (const m of result.means) {
        rows.push([headerTitle(h), m.treatment, nameByNumber.get(m.treatment) ?? '', m.mean, m.group, m.n, m.std])
      }
    }
    // Quote every field, and neutralize CSV/Excel formula injection: a cell beginning with
    // = + - @ (or a leading tab/CR) is prefixed with a single quote so spreadsheets treat it as text.
    const cell = (c: string | number): string => {
      let s = String(c)
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
      return `"${s.replace(/"/g, '""')}"`
    }
    const csv = rows.map((r) => r.map(cell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${protocol.title || 'trial'}-means.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const site = [trial.siteName, trial.location, trial.city, trial.state, trial.country].filter(Boolean).join(', ')

  const treatmentLabel = (id: number): string => {
    const t = snap.treatments.find((x) => x.id === id)
    return t ? `${t.number}. ${t.name || 'Trt ' + t.number}` : `#${id}`
  }
  const excludedPlots = snap.plots.filter((p) => p.excluded)

  return (
    <>
      <div className="card no-print">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Report</h2>
          <div className="row">
            <div style={{ width: 170 }}>
              <label>Mean comparison</label>
              <select value={test} onChange={(e) => setTest(e.target.value as MeanComparisonTest)}>
                {TESTS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ width: 90 }}>
              <label>Alpha</label>
              <select value={alpha} onChange={(e) => setAlpha(Number(e.target.value) as AlphaLevel)}>
                <option value={0.01}>0.01</option>
                <option value={0.05}>0.05</option>
                <option value={0.1}>0.10</option>
              </select>
            </div>
            <button onClick={() => window.print()} disabled={!anyResults}>
              Print
            </button>
            <button className="primary" onClick={exportCsv} disabled={!anyResults}>
              Export means CSV
            </button>
          </div>
        </div>
      </div>

      <div className="report-doc">
        <div className="card report-title">
          <h1>{protocol.title || 'Untitled trial'}</h1>
          <p className="report-subtitle">
            {[protocol.crop, protocol.season, protocol.targetPest].filter(Boolean).join(' · ') ||
              'Agricultural field trial'}
          </p>
          <table className="report-meta" style={{ maxWidth: 680 }}>
            <tbody>
              <tr>
                <th>Investigator</th>
                <td>{protocol.investigator || '—'}</td>
                <th>Design</th>
                <td>
                  {protocol.design}, {protocol.replicates} reps, {snap.plots.length} plots
                </td>
              </tr>
              <tr>
                <th>Site</th>
                <td>{site || '—'}</td>
                <th>Operator</th>
                <td>{trial.operator || '—'}</td>
              </tr>
              <tr>
                <th>Protocol</th>
                <td>
                  <code>{protocol.protocolUid.slice(0, 8) || '—'}</code> v{protocol.protocolVersion}
                </td>
                <th>Generated</th>
                <td>{generatedAt}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Treatments</h2>
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Name</th>
                <th style={{ width: 70 }}>Timing</th>
                <th>Product</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {snap.treatments.map((t) =>
                t.applications.length === 0 ? (
                  <tr key={t.number}>
                    <td className="num">{t.number}</td>
                    <td>{t.name || `Treatment ${t.number}`}</td>
                    <td>—</td>
                    <td className="muted">untreated</td>
                    <td>—</td>
                  </tr>
                ) : (
                  t.applications.map((l, li) => (
                    <tr key={`${t.number}-${li}`}>
                      {li === 0 ? (
                        <>
                          <td className="num" rowSpan={t.applications.length}>
                            {t.number}
                          </td>
                          <td rowSpan={t.applications.length}>{t.name || `Treatment ${t.number}`}</td>
                        </>
                      ) : null}
                      <td>{l.applicationRef || '—'}</td>
                      <td>{l.product || '—'}</td>
                      <td>{[l.rate, l.rateUnit].filter(Boolean).join(' ') || '—'}</td>
                    </tr>
                  ))
                )
              )}
            </tbody>
          </table>
        </div>

        {excludedPlots.length > 0 && (
          <div className="card">
            <h2>Excluded Plots</h2>
            <p className="muted">
              These plots are omitted from all analysis below; their data is retained on record.
            </p>
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Plot</th>
                  <th>Treatment</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {excludedPlots.map((p) => (
                  <tr key={p.id}>
                    <td className="num">{p.plotNumber}</td>
                    <td>{treatmentLabel(p.treatmentId)}</td>
                    <td>{p.excludeReason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {analyzed.length === 0 ? (
          <div className="card">
            <p className="muted">No measurements are marked for analysis.</p>
          </div>
        ) : (
          <div className="card">
            <h2>Overview — Treatment Effect by Measurement</h2>
            <table className="data">
              <thead>
                <tr>
                  <th>Measurement</th>
                  <th className="num">n</th>
                  <th className="num">Grand mean</th>
                  <th className="num">CV %</th>
                  <th className="num">Critical value</th>
                  <th className="num">Pr(&gt;F)</th>
                  <th>Treatment effect</th>
                </tr>
              </thead>
              <tbody>
                {overview.map(({ h, result, n, pValue }) => (
                  <tr key={h.id}>
                    <td>
                      {headerTitle(h)}
                      {(h.subsamples ?? 1) > 1 && (
                        <span className="muted"> · mean of {h.subsamples} subsamples</span>
                      )}
                    </td>
                    <td className="num">{n}</td>
                    {result && !result.note ? (
                      <>
                        <td className="num">{result.grandMean.toFixed(3)}</td>
                        <td className="num">{Number.isFinite(result.cv) ? result.cv.toFixed(2) : '—'}</td>
                        <td className="num">
                          {result.lsd != null ? `${result.criticalValueLabel} ${result.lsd.toFixed(3)}` : '—'}
                        </td>
                        <td className="num">{pValue != null ? pValue.toFixed(4) : ''}</td>
                        <td className={result.significant ? 'sig-yes' : 'sig-no'}>
                          {result.significant ? 'significant' : 'not significant'}
                        </td>
                      </>
                    ) : (
                      <td className="muted" colSpan={5}>
                        {result?.note ?? (n < MIN_OBS ? 'insufficient data' : analyzing ? 'analyzing…' : '—')}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {excludedHeaders.length > 0 && (
              <p className="muted" style={{ marginTop: 10 }}>
                Not analyzed: {excludedHeaders.map(headerTitle).join(', ')}
              </p>
            )}
          </div>
        )}

        {overview.map(({ h, result }) =>
          result ? (
            <div className="card report-measurement" key={h.id}>
              <h2>{headerTitle(h)}</h2>
              <MeasurementMeta h={h} />
              {(h.subsamples ?? 1) > 1 && (
                <p className="muted" style={{ marginTop: 0 }}>
                  Each plot value is the mean of {h.subsamples} subsamples.
                </p>
              )}
              {result.note ? (
                <div className="banner">{result.note}</div>
              ) : (
                <>
                  <h3 style={{ margin: '4px 0' }}>Analysis of Variance</h3>
                  <AnovaTable result={result} />
                  <h3 style={{ margin: '16px 0 4px' }}>Treatment Means ({result.criticalValueLabel})</h3>
                  <MeansTable result={result} treatments={snap.treatments} />
                  <div style={{ marginTop: 8 }}>
                    <MeansBarChart means={result.means} treatments={snap.treatments} />
                  </div>
                </>
              )}
            </div>
          ) : null
        )}
      </div>
    </>
  )
}
