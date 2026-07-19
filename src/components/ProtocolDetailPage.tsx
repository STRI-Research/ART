'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, type ProtocolSnapshot } from '@/lib/api'
import { Combobox } from '@/components/Combobox'
import { TreatmentProgram, programSummary } from '@/components/TreatmentProgram'
import { eventOffsets, dateForOffset, finishDate, solveCount, cadenceOffsets } from '@shared/schedule'
import { parseFormula } from '@shared/formula'
import { validateDesign } from '@shared/design'
import type {
  Protocol,
  Treatment,
  Application,
  MeasurementDef,
  DesignType,
  LibraryCategory,
} from '@shared/types'

type Tab = 'details' | 'applications' | 'treatments' | 'measurements'

const TABS: { id: Tab; label: string }[] = [
  { id: 'details', label: 'Protocol Details' },
  { id: 'applications', label: 'Applications' },
  { id: 'treatments', label: 'Treatments' },
  { id: 'measurements', label: 'Measurements' },
]

export function ProtocolDetailPage({ id }: { id: number }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<Tab>('details')

  const [protocol, setProtocol] = useState<Protocol | null>(null)
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [measurementDefs, setMeasurementDefs] = useState<MeasurementDef[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => {
    api.protocols.get(id).then((s: ProtocolSnapshot) => {
      setProtocol(s.protocol)
      setTreatments(s.treatments)
      setApplications(s.applications)
      setMeasurementDefs(s.measurementDefs)
      setLoading(false)
    })
  }, [id])

  const toggleExpanded = (n: number): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })

  const saveProtocol = useCallback(
    (next: Protocol): void => {
      setSaving(true)
      api.protocols
        .save(id, next)
        .then(setProtocol)
        .finally(() => setSaving(false))
    },
    [id]
  )

  const saveTreatments = useCallback(
    (next: Treatment[]): void => {
      setTreatments(next)
      setSaving(true)
      api.protocols
        .saveTreatments(id, next)
        .then(setTreatments)
        .finally(() => setSaving(false))
    },
    [id]
  )

  const saveApplications = useCallback(
    (next: Application[]): void => {
      setSaving(true)
      api.protocols
        .saveApplications(
          id,
          next.map((a, i) => ({ ...a, ordinal: i }))
        )
        .then(setApplications)
        .finally(() => setSaving(false))
    },
    [id]
  )

  const saveMeasurementDefs = useCallback(
    (next: MeasurementDef[]): void => {
      setSaving(true)
      api.protocols
        .saveMeasurementDefs(id, next)
        .then(setMeasurementDefs)
        .finally(() => setSaving(false))
    },
    [id]
  )

  const handleDelete = async (): Promise<void> => {
    if (!confirm('Delete this protocol? This cannot be undone.')) return
    await api.protocols.delete(id)
    router.push('/protocol')
  }

  if (loading || !protocol) {
    return (
      <div style={{ padding: 24 }}>
        <p className="muted">Loading…</p>
      </div>
    )
  }

  const designValidation = validateDesign(
    protocol.design,
    protocol.replicates,
    protocol.blockSize,
    treatments.length
  )

  const field = (key: keyof Protocol, label: string, textarea = false) => (
    <div style={textarea ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}</label>
      {textarea ? (
        <textarea
          rows={3}
          value={protocol[key] as string}
          onChange={(e) => setProtocol({ ...protocol, [key]: e.target.value })}
          onBlur={() => saveProtocol(protocol)}
        />
      ) : (
        <input
          value={protocol[key] as string}
          onChange={(e) => setProtocol({ ...protocol, [key]: e.target.value })}
          onBlur={() => saveProtocol(protocol)}
        />
      )}
    </div>
  )

  // A protocol field backed by a library vocabulary (crop-aware suggestions + free type).
  const comboField = (key: keyof Protocol, label: string, category: LibraryCategory) => (
    <div>
      <label>{label}</label>
      <Combobox
        category={category}
        crop={category === 'crop' ? '' : protocol.crop}
        value={protocol[key] as string}
        onChange={(v) => {
          const next = { ...protocol, [key]: v }
          setProtocol(next)
          saveProtocol(next)
        }}
      />
    </div>
  )

  const addTreatment = (): void => {
    const number = treatments.length ? Math.max(...treatments.map((t) => t.number)) + 1 : 1
    saveTreatments([
      ...treatments,
      {
        number,
        name: number === 1 ? 'Untreated Check' : '',
        type: '',
        isCheck: number === 1,
        applications: [],
      },
    ])
  }

  const updateTreatment = (i: number, patch: Partial<Treatment>): void =>
    setTreatments(treatments.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <div className="cta-row" style={{ marginBottom: 20 }}>
        <button onClick={() => router.push('/protocol')}>&larr; Protocols</button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saving && (
            <span className="muted" style={{ fontSize: 12 }}>
              Saving…
            </span>
          )}
          <button className="danger" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="segmented" style={{ marginBottom: 20 }}>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <>
          <div className="card">
            <h2>Protocol</h2>
            <div className="field-grid">
              {field('title', 'Trial title')}
              {comboField('crop', 'Crop', 'crop')}
              {comboField('targetPest', 'Target pest / disease', 'target')}
              {field('investigator', 'Investigator')}
              {field('season', 'Season / year')}
              {field('objective', 'Objective')}
              {field('notes', 'Notes', true)}
            </div>
          </div>

          <div className="card">
            <h2>Experimental Design</h2>
            <p className="muted">
              Dictated to all trial sites. Sites re-randomize with their own seed but keep this
              design.
            </p>
            <div className="row">
              <div style={{ width: 220 }}>
                <label>Design</label>
                <select
                  value={protocol.design}
                  onChange={(e) => {
                    const next = { ...protocol, design: e.target.value as DesignType }
                    setProtocol(next)
                    saveProtocol(next)
                  }}
                >
                  <option value="RCB">Randomized Complete Block</option>
                  <option value="CRD">Completely Randomized</option>
                  <option value="ALPHA">Incomplete Block (Alpha)</option>
                </select>
              </div>
              <div style={{ width: 110 }}>
                <label>Replicates</label>
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={protocol.replicates}
                  onChange={(e) => setProtocol({ ...protocol, replicates: Number(e.target.value) })}
                  onBlur={() => saveProtocol(protocol)}
                />
              </div>
              {protocol.design === 'ALPHA' && (
                <div style={{ width: 110 }}>
                  <label>Block size (k)</label>
                  <input
                    type="number"
                    min={3}
                    value={protocol.blockSize}
                    onChange={(e) => setProtocol({ ...protocol, blockSize: Number(e.target.value) })}
                    onBlur={() => saveProtocol(protocol)}
                  />
                </div>
              )}
              <div style={{ width: 110 }}>
                <label>Plot width</label>
                <input
                  type="number"
                  value={protocol.plotWidth}
                  onChange={(e) => setProtocol({ ...protocol, plotWidth: Number(e.target.value) })}
                  onBlur={() => saveProtocol(protocol)}
                />
              </div>
              <div style={{ width: 110 }}>
                <label>Plot length</label>
                <input
                  type="number"
                  value={protocol.plotLength}
                  onChange={(e) => setProtocol({ ...protocol, plotLength: Number(e.target.value) })}
                  onBlur={() => saveProtocol(protocol)}
                />
              </div>
            </div>
            {protocol.design === 'ALPHA' &&
              (designValidation.ok ? (
                <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
                  Each replicate is split into {Math.floor(treatments.length / protocol.blockSize)}{' '}
                  incomplete blocks of {protocol.blockSize} plots.
                  {designValidation.validReplicates &&
                    ` Supported replicate counts for this layout: ${designValidation.validReplicates.join(', ')}.`}
                </p>
              ) : (
                <p style={{ marginTop: 8, marginBottom: 0, color: 'var(--danger)', fontWeight: 500 }}>
                  ⚠ {designValidation.error} A trial cannot be created until this is resolved.
                </p>
              ))}
          </div>
        </>
      )}

      {tab === 'applications' && (
        <ApplicationsSection
          applications={applications}
          crop={protocol.crop}
          startDate={protocol.startDate}
          onSave={saveApplications}
          onSaveStartDate={(d) => {
            const next = { ...protocol, startDate: d }
            setProtocol(next)
            saveProtocol(next)
          }}
        />
      )}

      {tab === 'treatments' && (
        <div className="card">
          <h2>Treatments</h2>
          <p className="muted">
            Each treatment is a program — its sequence of applications (product + rate at each
            timing). Expand a row to edit the program.
          </p>
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th style={{ width: 40 }}>#</th>
                <th style={{ width: 200 }}>Name</th>
                <th>Program</th>
                <th style={{ width: 60 }} title="Untreated check — used by % control formulas">
                  Check
                </th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {treatments.map((t, i) => (
                <Fragment key={t.id ?? i}>
                  <tr>
                    <td>
                      <button
                        className="expander"
                        title={expanded.has(t.number) ? 'Collapse' : 'Expand program'}
                        onClick={() => toggleExpanded(t.number)}
                      >
                        {expanded.has(t.number) ? '▾' : '▸'}
                      </button>
                    </td>
                    <td className="num">{t.number}</td>
                    <td>
                      <input
                        value={t.name}
                        onChange={(e) => updateTreatment(i, { name: e.target.value })}
                        onBlur={() => saveTreatments(treatments)}
                      />
                    </td>
                    <td
                      className="muted"
                      style={{ cursor: 'pointer', fontSize: 12 }}
                      onClick={() => toggleExpanded(t.number)}
                    >
                      {programSummary(t)}
                    </td>
                    <td className="num">
                      <input
                        type="checkbox"
                        checked={!!t.isCheck}
                        title="Mark as the untreated check for % control formulas"
                        onChange={(e) => {
                          const next = treatments.map((x, idx) =>
                            idx === i ? { ...x, isCheck: e.target.checked } : x
                          )
                          setTreatments(next)
                          saveTreatments(next)
                        }}
                      />
                    </td>
                    <td>
                      <button
                        className="danger"
                        title="Remove treatment"
                        onClick={() => saveTreatments(treatments.filter((_, idx) => idx !== i))}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                  {expanded.has(t.number) && (
                    <tr>
                      <td />
                      <td colSpan={5}>
                        <TreatmentProgram
                          applications={applications}
                          crop={protocol.crop}
                          value={t.applications}
                          onChange={(lines) =>
                            setTreatments(
                              treatments.map((x, idx) => (idx === i ? { ...x, applications: lines } : x))
                            )
                          }
                          onCommit={(lines) =>
                            saveTreatments(
                              treatments.map((x, idx) => (idx === i ? { ...x, applications: lines } : x))
                            )
                          }
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 10 }}>
            <button onClick={addTreatment}>+ Add treatment</button>
          </div>
        </div>
      )}

      {tab === 'measurements' && (
        <CoreMeasurements
          defs={measurementDefs}
          crop={protocol.crop}
          startDate={protocol.startDate}
          onSave={saveMeasurementDefs}
        />
      )}

      <div className="card" style={{ marginTop: 24, textAlign: 'center' }}>
        <button
          className="primary"
          disabled={!designValidation.ok || treatments.length < 2}
          title={
            !designValidation.ok
              ? designValidation.error
              : treatments.length < 2
                ? 'Add at least 2 treatments'
                : 'Create a trial site from this protocol'
          }
          onClick={async () => {
            const snap = await api.trials.create(id)
            router.push(`/trial/${snap.trial.id}`)
          }}
        >
          Create Trial from this Protocol
        </button>
        {(!designValidation.ok || treatments.length < 2) && (
          <p className="muted" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
            {!designValidation.ok ? designValidation.error : 'Add at least 2 treatments before creating a trial.'}
          </p>
        )}
      </div>
    </div>
  )
}

/** The application schedule. A start date + interval + count generate the dated applications
 *  (A, B, C…); the four fields stay linked (finish is derived, and editing it re-solves the count).
 *  Per row you can fine-tune the day-offset, growth stage and description. One protocol = one trial,
 *  so these dates are real. */
function ApplicationsSection({
  applications,
  crop,
  startDate,
  onSave,
  onSaveStartDate,
}: {
  applications: Application[]
  crop: string
  startDate: string
  onSave: (next: Application[]) => void
  onSaveStartDate: (date: string) => void
}) {
  // Local rows for smooth typing; committed to the server on blur / structural change.
  const [rows, setRows] = useState<Application[]>(applications)
  useEffect(() => setRows(applications), [applications])

  const count = rows.length
  const interval = rows.length >= 2 ? rows[1].dayOffset - rows[0].dayOffset || 14 : 14
  const finish = finishDate(startDate, count, interval)

  const buildRow = (i: number, offset: number): Application => {
    const prev = rows[i]
    return {
      id: prev?.id,
      ordinal: i,
      timingCode: prev?.timingCode || String.fromCharCode(65 + i),
      targetGrowthStage: prev?.targetGrowthStage ?? '',
      description: prev?.description ?? '',
      dayOffset: offset,
    }
  }

  // Regenerate the whole series from count + interval, preserving per-row metadata by position.
  const regenerate = (nextCount: number, nextInterval: number): void => {
    const n = Math.max(0, Math.min(26, Math.floor(nextCount || 0)))
    const next = eventOffsets(n, Math.max(1, Math.floor(nextInterval || 1))).map((off, i) => buildRow(i, off))
    setRows(next)
    onSave(next)
  }

  const editRow = (i: number, patch: Partial<Application>): void =>
    setRows(rows.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  const commit = (): void => onSave(rows)
  const remove = (i: number): void => {
    const next = rows.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, ordinal: idx }))
    setRows(next)
    onSave(next)
  }

  return (
    <div className="card">
      <h2>Application Schedule</h2>
      <p className="muted">
        Set the start date, the number of applications, and the interval — the timings and dates
        generate automatically and stay linked. Fine-tune any row below.
      </p>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ width: 160 }}>
          <label>Start date (day 0)</label>
          <input type="date" value={startDate} onChange={(e) => onSaveStartDate(e.target.value)} />
        </div>
        <div style={{ width: 120 }}>
          <label># applications</label>
          <input
            type="number"
            min={0}
            max={26}
            value={count}
            onChange={(e) => regenerate(Number(e.target.value), interval)}
          />
        </div>
        <div style={{ width: 120 }}>
          <label>Interval (days)</label>
          <input
            type="number"
            min={1}
            value={interval}
            onChange={(e) => regenerate(count, Number(e.target.value))}
          />
        </div>
        <div style={{ width: 160 }}>
          <label>Finish date</label>
          <input
            type="date"
            value={finish}
            disabled={!startDate || count < 2}
            onChange={(e) => {
              const c = solveCount(startDate, e.target.value, interval)
              if (c != null) regenerate(c, interval)
            }}
          />
        </div>
      </div>

      {rows.length > 0 && (
        <table className="data" style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th style={{ width: 64 }}>Timing</th>
              <th style={{ width: 64 }}>Day</th>
              <th style={{ width: 130 }}>Date</th>
              <th style={{ width: 200 }}>Target growth stage</th>
              <th>Description</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr key={a.id ?? i}>
                <td>
                  <input
                    style={{ width: 48 }}
                    value={a.timingCode}
                    onChange={(e) => editRow(i, { timingCode: e.target.value.toUpperCase().slice(0, 4) })}
                    onBlur={commit}
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    style={{ width: 52 }}
                    value={a.dayOffset}
                    onChange={(e) => editRow(i, { dayOffset: Number(e.target.value) })}
                    onBlur={commit}
                  />
                </td>
                <td className="muted">{dateForOffset(startDate, a.dayOffset) || '—'}</td>
                <td>
                  <Combobox
                    category="growth_stage"
                    crop={crop}
                    value={a.targetGrowthStage}
                    onChange={(v) => {
                      editRow(i, { targetGrowthStage: v })
                      onSave(rows.map((x, idx) => (idx === i ? { ...x, targetGrowthStage: v } : x)))
                    }}
                  />
                </td>
                <td>
                  <input
                    value={a.description}
                    placeholder="e.g. first fungicide spray"
                    onChange={(e) => editRow(i, { description: e.target.value })}
                    onBlur={commit}
                  />
                </td>
                <td>
                  <button className="danger" title="Remove application" onClick={() => remove(i)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ marginTop: 10 }}>
        <button onClick={() => regenerate(count + 1, interval)}>+ Add application</button>
      </div>
    </div>
  )
}

/** Cadence summary, e.g. "day 0, every 7d ×20" or "day 14 (once)". */
function cadenceSummary(d: MeasurementDef): string {
  const occ = Math.max(1, d.occurrences ?? 1)
  const off = d.startOffset ?? 0
  if (occ <= 1) return `day ${off} (once)`
  return `day ${off}, every ${d.intervalDays ?? 0}d ×${occ}`
}

/** Author-defined assessment schedule. Each assessment has a cadence (first day + interval + count);
 *  the schedule table shows every occurrence across the trial period so different intervals (e.g.
 *  Disease % on 7 days, others on 14) can be seen interleaved. */
function CoreMeasurements({
  defs,
  crop,
  startDate,
  onSave,
}: {
  defs: MeasurementDef[]
  crop: string
  startDate: string
  onSave: (next: MeasurementDef[]) => void
}) {
  const emptyDraft = {
    partMeasured: '',
    measurementType: '',
    measurementUnit: '',
    subsamples: 1,
    formula: '',
    startOffset: 0,
    intervalDays: 7,
    occurrences: 1,
  }
  const [draft, setDraft] = useState(emptyDraft)
  const calc = draft.formula.trim().length > 0
  const parsed = calc ? parseFormula(draft.formula) : null
  const formulaError = parsed && !parsed.ok ? parsed.error : null

  const add = (): void => {
    onSave([
      ...defs,
      {
        partMeasured: draft.partMeasured,
        measurementType: draft.measurementType,
        measurementUnit: draft.measurementUnit,
        applicationRef: '',
        daysAfter: null,
        timing: '',
        description:
          [draft.measurementType, draft.partMeasured].filter(Boolean).join(' ') || 'Measurement',
        ordinal: defs.length,
        analyze: true,
        subsamples: calc ? 1 : Math.max(1, draft.subsamples || 1),
        formula: calc ? draft.formula.trim() : '',
        startOffset: draft.startOffset || 0,
        intervalDays: Math.max(0, draft.intervalDays || 0),
        occurrences: Math.max(1, draft.occurrences || 1),
      },
    ])
    setDraft(emptyDraft)
  }

  const patch = (i: number, p: Partial<MeasurementDef>): void =>
    onSave(defs.map((d, idx) => (idx === i ? { ...d, ...p } : d)))

  // The interleaved assessment calendar: every distinct occurrence day across all assessments.
  const scheduled = defs.map((d) => ({
    d,
    offsets: cadenceOffsets({
      startOffset: d.startOffset ?? 0,
      intervalDays: d.intervalDays ?? 0,
      occurrences: d.occurrences ?? 1,
    }),
  }))
  const allOffsets = [...new Set(scheduled.flatMap((s) => s.offsets))].sort((a, b) => a - b)

  return (
    <div className="card">
      <h2>Assessment Schedule</h2>
      <p className="muted">
        Each assessment has its own cadence — a first day, an interval, and a count. The schedule
        below shows every occurrence, so different intervals (e.g. Disease % every 7 days, the rest
        every 14) line up on a single calendar.
      </p>

      {defs.length > 0 ? (
        <table className="data" style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th>Assessment</th>
              <th>Unit</th>
              <th style={{ width: 70 }}>First day</th>
              <th style={{ width: 90 }}>Interval (d)</th>
              <th style={{ width: 70 }}>Count</th>
              <th>Cadence</th>
              <th style={{ width: 60 }}>Subs</th>
              <th style={{ width: 70 }}>Analyze</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {defs.map((d, i) => (
              <tr key={d.id ?? i}>
                <td>
                  {d.measurementType || d.partMeasured || '—'}
                  {d.formula && (
                    <div className="muted" style={{ fontSize: 11 }}>
                      ƒ {d.formula}
                    </div>
                  )}
                </td>
                <td>{d.measurementUnit || '—'}</td>
                <td className="num">
                  <input
                    type="number"
                    style={{ width: 56 }}
                    value={d.startOffset ?? 0}
                    onChange={(e) => patch(i, { startOffset: Number(e.target.value) })}
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    min={0}
                    style={{ width: 70 }}
                    value={d.intervalDays ?? 0}
                    onChange={(e) => patch(i, { intervalDays: Number(e.target.value) })}
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    min={1}
                    style={{ width: 56 }}
                    value={d.occurrences ?? 1}
                    onChange={(e) => patch(i, { occurrences: Math.max(1, Number(e.target.value)) })}
                  />
                </td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {cadenceSummary(d)}
                </td>
                <td className="num">{d.formula ? '—' : (d.subsamples ?? 1)}</td>
                <td className="num">
                  <input
                    type="checkbox"
                    checked={d.analyze}
                    onChange={() => patch(i, { analyze: !d.analyze })}
                    title="Include this assessment in ANOVA and the report"
                  />
                </td>
                <td>
                  <button className="danger" onClick={() => onSave(defs.filter((_, idx) => idx !== i))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No assessments defined yet.</p>
      )}

      <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ width: 160 }}>
          <label>Assessment</label>
          <Combobox
            category="measurement_type"
            crop={crop}
            value={draft.measurementType}
            onChange={(v) => setDraft({ ...draft, measurementType: v })}
          />
        </div>
        <div style={{ width: 140 }}>
          <label>Part measured</label>
          <Combobox
            category="part_measured"
            crop={crop}
            value={draft.partMeasured}
            onChange={(v) => setDraft({ ...draft, partMeasured: v })}
          />
        </div>
        <div style={{ width: 90 }}>
          <label>Unit</label>
          <Combobox
            category="unit"
            crop={crop}
            value={draft.measurementUnit}
            onChange={(v) => setDraft({ ...draft, measurementUnit: v })}
          />
        </div>
        <div style={{ width: 70 }}>
          <label>First day</label>
          <input
            type="number"
            value={draft.startOffset}
            onChange={(e) => setDraft({ ...draft, startOffset: Number(e.target.value) })}
          />
        </div>
        <div style={{ width: 80 }}>
          <label>Interval</label>
          <input
            type="number"
            min={0}
            value={draft.intervalDays}
            onChange={(e) => setDraft({ ...draft, intervalDays: Number(e.target.value) })}
          />
        </div>
        <div style={{ width: 64 }}>
          <label>Count</label>
          <input
            type="number"
            min={1}
            value={draft.occurrences}
            onChange={(e) => setDraft({ ...draft, occurrences: Number(e.target.value) })}
          />
        </div>
        <div style={{ width: 70 }}>
          <label>Subs</label>
          <input
            type="number"
            min={1}
            max={50}
            value={draft.subsamples}
            disabled={calc}
            title={calc ? 'Calculated columns have no subsamples' : undefined}
            onChange={(e) => setDraft({ ...draft, subsamples: Number(e.target.value) })}
          />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label>Formula (optional → calculated)</label>
          <input
            value={draft.formula}
            placeholder="e.g. abbott([1])"
            onChange={(e) => setDraft({ ...draft, formula: e.target.value })}
          />
        </div>
        <button className="primary" onClick={add} disabled={!!formulaError}>
          + Add
        </button>
      </div>
      {calc && (
        <div style={{ marginTop: 6, fontSize: 12 }}>
          {formulaError ? (
            <span style={{ color: '#b00020' }}>⚠ {formulaError}</span>
          ) : (
            <span className="muted">
              Reference assessments by column number —{' '}
              {defs
                .map((d, i) => `[${i + 1}] ${d.description || d.measurementType || 'Assessment'}`)
                .join('   ')}
              {defs.length === 0 && 'none to reference yet'}. Use control([n]) or abbott([n]) for % of
              untreated control.
            </span>
          )}
        </div>
      )}

      {allOffsets.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ margin: '0 0 8px' }}>Schedule</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data schedule-grid">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Day</th>
                  <th style={{ width: 110 }}>Date</th>
                  {scheduled.map((s, i) => (
                    <th key={i} className="num">
                      {s.d.measurementType || `#${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allOffsets.map((off) => (
                  <tr key={off}>
                    <td className="num">{off}</td>
                    <td className="muted">{dateForOffset(startDate, off) || '—'}</td>
                    {scheduled.map((s, i) => (
                      <td key={i} className="num">
                        {s.offsets.includes(off) ? <span className="sched-hit">●</span> : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
