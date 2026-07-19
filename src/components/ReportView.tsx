'use client'

import { useEffect, useMemo, useState } from 'react'
import { api, type TrialSnapshot } from '@/lib/api'
import { toProjectSnapshot } from '@/lib/snapshot'
import { buildObservations, type Observation } from '@/lib/stats/buildData'
import { runAnova } from '@/lib/stats/anova'
import { categoryStroke } from '@/lib/colors'
import { TESTS } from './StatsView'
import type {
  MeasurementHeader,
  MeanComparisonTest,
  AlphaLevel,
  AovResult,
  Treatment,
} from '@shared/types'

const MIN_OBS = 3 // ANOVA needs at least a few observations to be meaningful

function headerTitle(h: MeasurementHeader): string {
  return h.measurementType || h.description || `Measurement ${h.ordinal + 1}`
}

/** ISO "YYYY-MM-DD" → "DD.MM.YY"; passes anything else through unchanged. */
function shortDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}.${m[2]}.${m[1].slice(2)}` : iso
}

function daysAfter(iso: string, base: string): number | null {
  const d = Date.parse(iso)
  const b = Date.parse(base)
  if (Number.isNaN(d) || Number.isNaN(b)) return null
  return Math.round((d - b) / 86_400_000)
}

function fmtMean(v: number): string {
  if (!Number.isFinite(v)) return '—'
  return String(Math.round(v * 100) / 100)
}

function fmtP(p: number | null, alpha: number): string {
  if (p == null) return '—'
  if (p >= alpha) return 'ns'
  if (p < 0.001) return '<0.001'
  return p.toFixed(3)
}

interface MetricGroup {
  type: string
  headers: MeasurementHeader[] // sorted by date then ordinal
}

// ---------------------------------------------------------------------------
// Cross-tab table: treatments (rows) × assessment dates (columns)
// ---------------------------------------------------------------------------
function MetricTable({
  group,
  results,
  treatments,
  alpha,
}: {
  group: MetricGroup
  results: Record<number, AovResult>
  treatments: Treatment[]
  alpha: number
}) {
  const trts = [...treatments].sort((a, b) => a.number - b.number)
  const base = group.headers[0]?.measurementDate ?? ''
  const meanFor = (h: MeasurementHeader, trtNumber: number) =>
    results[h.id!]?.means.find((m) => m.treatment === trtNumber)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data report-crosstab">
        <thead>
          <tr>
            <th rowSpan={2} className="sticky-col" style={{ textAlign: 'left', minWidth: 150 }}>
              Treatment
            </th>
            {group.headers.map((h) => (
              <th key={h.id} className="num">
                {shortDate(h.measurementDate) || `col ${h.ordinal + 1}`}
              </th>
            ))}
          </tr>
          <tr>
            {group.headers.map((h) => {
              const d = daysAfter(h.measurementDate, base)
              return (
                <th key={h.id} className="num muted" style={{ fontWeight: 400, fontSize: 11 }}>
                  {d != null ? `${d} DAT` : ''}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {trts.map((t) => (
            <tr key={t.number}>
              <td className="sticky-col">
                [{t.number}] {t.name || `Treatment ${t.number}`}
              </td>
              {group.headers.map((h) => {
                const r = results[h.id!]
                const m = meanFor(h, t.number)
                const letters = r?.significant ? m?.group ?? '' : ''
                return (
                  <td key={h.id} className="num">
                    {m ? (
                      <>
                        {fmtMean(m.mean)}
                        {letters && <span className="sep-letters"> {letters}</span>}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          {(['P', 'LSD', 'd.f.', '%c.v.'] as const).map((label) => (
            <tr key={label} className="crosstab-stat">
              <th className="sticky-col" style={{ textAlign: 'left' }}>{label}</th>
              {group.headers.map((h) => {
                const r = results[h.id!]
                let v = '—'
                if (r && !r.note) {
                  const trtRow = r.anova.find((a) => a.source === 'treatment')
                  const errRow = r.anova.find((a) => a.source === 'error')
                  if (label === 'P') v = fmtP(trtRow?.pValue ?? null, alpha)
                  else if (label === 'LSD') v = r.significant && r.lsd != null ? r.lsd.toFixed(3) : '-'
                  else if (label === 'd.f.') v = errRow ? String(errRow.df) : '—'
                  else v = Number.isFinite(r.cv) ? r.cv.toFixed(1) : '—'
                }
                return (
                  <td key={h.id} className="num">
                    {v}
                  </td>
                )
              })}
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Multi-series line chart: one line per treatment, mean over assessment dates
// ---------------------------------------------------------------------------
function MetricLineChart({
  group,
  results,
  treatments,
}: {
  group: MetricGroup
  results: Record<number, AovResult>
  treatments: Treatment[]
}) {
  const trts = [...treatments].sort((a, b) => a.number - b.number)
  const headers = group.headers
  const series = trts.map((t, ti) => ({
    t,
    ti,
    pts: headers.map((h, xi) => {
      const m = results[h.id!]?.means.find((mm) => mm.treatment === t.number)
      return m && Number.isFinite(m.mean) ? { xi, y: m.mean } : null
    }),
  }))
  const allY = series.flatMap((s) => s.pts.filter(Boolean).map((p) => p!.y))
  if (headers.length === 0 || allY.length === 0) return null

  const yMax = Math.max(...allY)
  const yMin = Math.min(...allY, 0)
  const W = 760
  const H = 300
  const mL = 40
  const mR = 12
  const mT = 12
  const mB = 52
  const plotW = W - mL - mR
  const plotH = H - mT - mB
  const x = (i: number) => (headers.length === 1 ? mL + plotW / 2 : mL + (i / (headers.length - 1)) * plotW)
  const span = yMax - yMin || 1
  const y = (v: number) => mT + plotH - ((v - yMin) / span) * plotH
  const ticks = [yMin, yMin + span / 2, yMax]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block' }} role="img" aria-label="Treatment means over time">
        {ticks.map((tv, i) => (
          <g key={i}>
            <line x1={mL} x2={W - mR} y1={y(tv)} y2={y(tv)} stroke="var(--border)" strokeWidth={0.5} strokeDasharray={i === 0 ? undefined : '2,2'} />
            <text x={mL - 6} y={y(tv)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--muted)">
              {Math.round(tv * 10) / 10}
            </text>
          </g>
        ))}
        {headers.map((h, i) => (
          <text
            key={h.id}
            x={x(i)}
            y={H - mB + 14}
            textAnchor="end"
            fontSize={9}
            fill="var(--muted)"
            transform={`rotate(-40 ${x(i)} ${H - mB + 14})`}
          >
            {shortDate(h.measurementDate)}
          </text>
        ))}
        {series.map((s) => {
          const pts = s.pts.filter(Boolean) as { xi: number; y: number }[]
          const stroke = categoryStroke(s.ti)
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.xi).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')
          return (
            <g key={s.t.number}>
              <path d={d} fill="none" stroke={stroke} strokeWidth={1.8} />
              {pts.map((p) => (
                <circle key={p.xi} cx={x(p.xi)} cy={y(p.y)} r={2.4} fill={stroke} />
              ))}
            </g>
          )
        })}
      </svg>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.t.number} className="legend-item">
            <span className="legend-swatch" style={{ background: categoryStroke(s.ti) }} />
            [{s.t.number}] {s.t.name || `Treatment ${s.t.number}`}
          </span>
        ))}
      </div>
    </div>
  )
}

function MetricSection({
  group,
  results,
  treatments,
  alpha,
}: {
  group: MetricGroup
  results: Record<number, AovResult>
  treatments: Treatment[]
  alpha: number
}) {
  return (
    <div className="card report-measurement">
      <h2 style={{ marginTop: 0 }}>{group.type}</h2>
      <MetricTable group={group} results={results} treatments={treatments} alpha={alpha} />
      <div style={{ marginTop: 16 }}>
        <MetricLineChart group={group} results={results} treatments={treatments} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
export function ReportView({ trialId }: { trialId: number }) {
  const [snap, setSnap] = useState<TrialSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [test, setTest] = useState<MeanComparisonTest>('LSD')
  const [alpha, setAlpha] = useState<AlphaLevel>(0.05)
  const [selected, setSelected] = useState<string>('ALL')
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

  const obsByHeader = useMemo(() => {
    const m = new Map<number, Observation[]>()
    if (!snap) return m
    const ps = toProjectSnapshot(snap)
    for (const h of analyzed) m.set(h.id!, buildObservations(ps, h.id!))
    return m
  }, [snap, analyzed])

  // ANOVA is pure jStat — compute every column in-memory, so a repeated-measures trial with hundreds
  // of dated columns doesn't fire hundreds of API calls.
  const results = useMemo(() => {
    const out: Record<number, AovResult> = {}
    if (!snap) return out
    const isAlpha = snap.protocol.design === 'ALPHA'
    for (const h of analyzed) {
      const data = obsByHeader.get(h.id!) ?? []
      if (data.length < MIN_OBS) continue
      out[h.id!] = runAnova({
        design: snap.protocol.design,
        test,
        alpha,
        blockSize: isAlpha ? snap.protocol.blockSize : undefined,
        data,
      })
    }
    return out
  }, [snap, analyzed, obsByHeader, test, alpha])

  // Group the analyzed columns by measurement type; sort each group's columns by date then ordinal.
  const groups = useMemo<MetricGroup[]>(() => {
    const byType = new Map<string, MeasurementHeader[]>()
    for (const h of analyzed) {
      const key = h.measurementType || headerTitle(h)
      const arr = byType.get(key)
      if (arr) arr.push(h)
      else byType.set(key, [h])
    }
    return [...byType.entries()].map(([type, headers]) => ({
      type,
      headers: headers.sort(
        (a, b) => (a.measurementDate || '').localeCompare(b.measurementDate || '') || a.ordinal - b.ordinal
      ),
    }))
  }, [analyzed])

  if (loading || !snap) {
    return (
      <div className="card">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  const protocol = snap.protocol
  const trial = snap.trial
  const nameByNumber = new Map(snap.treatments.map((t) => [t.number, t.name || `Trt ${t.number}`]))
  const site = [trial.siteName, trial.location, trial.city, trial.state, trial.country].filter(Boolean).join(', ')

  const exportCsv = (): void => {
    const rows: (string | number)[][] = [['measurement', 'date', 'treatment_number', 'treatment_name', 'mean', 'group']]
    for (const g of groups) {
      for (const h of g.headers) {
        const r = results[h.id!]
        if (!r) continue
        for (const m of r.means) {
          rows.push([g.type, shortDate(h.measurementDate), m.treatment, nameByNumber.get(m.treatment) ?? '', m.mean, r.significant ? m.group : ''])
        }
      }
    }
    const cell = (c: string | number): string => {
      let s = String(c)
      // Neutralize CSV/Excel formula injection, but don't mangle a genuine negative/decimal number
      // (e.g. a -32.2 % control) into text.
      const isNumeric = typeof c === 'number' || /^-?\d*\.?\d+$/.test(s)
      if (!isNumeric && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
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
            <button onClick={() => window.print()} disabled={groups.length === 0}>
              Print
            </button>
            <button className="primary" onClick={exportCsv} disabled={groups.length === 0}>
              Export means CSV
            </button>
          </div>
        </div>
      </div>

      <div className="report-doc">
        <div className="card report-title">
          <h1>{protocol.title || 'Untitled trial'}</h1>
          <p className="report-subtitle">
            {[protocol.crop, protocol.season, protocol.targetPest].filter(Boolean).join(' · ') || 'Agricultural field trial'}
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
                <th>Generated</th>
                <td>{generatedAt}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {groups.length === 0 ? (
          <div className="card">
            <p className="muted">No measurements are marked for analysis.</p>
          </div>
        ) : (
          <>
            {/* Metric tabs */}
            <div className="card no-print" style={{ paddingTop: 10, paddingBottom: 10 }}>
              <div className="metric-tabs">
                <button className={selected === 'ALL' ? 'metric-tab active' : 'metric-tab'} onClick={() => setSelected('ALL')}>
                  All metrics
                </button>
                {groups.map((g) => (
                  <button
                    key={g.type}
                    className={selected === g.type ? 'metric-tab active' : 'metric-tab'}
                    onClick={() => setSelected(g.type)}
                  >
                    {g.type}
                  </button>
                ))}
              </div>
            </div>

            {/* All sections render (so Print always includes everything); non-selected are hidden
                on screen only. */}
            {groups.map((g) => (
              <div key={g.type} className={selected !== 'ALL' && selected !== g.type ? 'metric-hidden' : ''}>
                <MetricSection group={g} results={results} treatments={snap.treatments} alpha={alpha} />
              </div>
            ))}
          </>
        )}
      </div>
    </>
  )
}
