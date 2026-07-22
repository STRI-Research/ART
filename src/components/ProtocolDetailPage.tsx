'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, type ProtocolSnapshot } from '@/lib/api'
import { Combobox } from '@/components/Combobox'
import { TimingField } from '@/components/TimingField'
import { TreatmentProgram, programSummary } from '@/components/TreatmentProgram'
import { timingLabel } from '@shared/timing'
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
        notes: '',
        version: 1,
        applications: [],
        components: [],
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
        <ApplicationsSection applications={applications} crop={protocol.crop} onSave={saveApplications} />
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
          applications={applications}
          crop={protocol.crop}
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

/** Protocol applications — the timing *plan* (A/B/C…): each a timing code + intended crop growth
 * stage. Measurements anchor their timing to these; the actual date each happened is trial-side. */
function ApplicationsSection({
  applications,
  crop,
  onSave,
}: {
  applications: Application[]
  crop: string
  onSave: (next: Application[]) => void
}) {
  const nextCode = (): string => {
    // Suggest the next letter A, B, C… not already used.
    const used = new Set(applications.map((a) => a.timingCode))
    for (let i = 0; i < 26; i++) {
      const c = String.fromCharCode(65 + i)
      if (!used.has(c)) return c
    }
    return ''
  }

  const add = (): void =>
    onSave([
      ...applications,
      { ordinal: applications.length, timingCode: nextCode(), targetGrowthStage: '', description: '' },
    ])
  const update = (i: number, patch: Partial<Application>): void =>
    onSave(applications.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  const remove = (i: number): void => onSave(applications.filter((_, idx) => idx !== i))

  return (
    <div className="card">
      <h2>Applications</h2>
      <p className="muted">
        The treatment-application schedule (A, B, C…). Measurements can be timed relative to an
        application (e.g. &quot;14&nbsp;DA-A&quot;). The date each application actually happens is
        recorded per trial site.
      </p>
      {applications.length > 0 && (
        <table className="data" style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 70 }}>Timing</th>
              <th style={{ width: 200 }}>Target growth stage</th>
              <th>Description</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {applications.map((a, i) => (
              <tr key={a.id ?? i}>
                <td>
                  <input
                    style={{ width: 54 }}
                    value={a.timingCode}
                    onChange={(e) => update(i, { timingCode: e.target.value.toUpperCase().slice(0, 4) })}
                  />
                </td>
                <td>
                  <Combobox
                    category="growth_stage"
                    crop={crop}
                    value={a.targetGrowthStage}
                    onChange={(v) => update(i, { targetGrowthStage: v })}
                  />
                </td>
                <td>
                  <input
                    value={a.description}
                    placeholder="e.g. first fungicide spray"
                    onChange={(e) => update(i, { description: e.target.value })}
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
      <button onClick={add}>+ Add application</button>
    </div>
  )
}

/** Author-defined core measurement schedule. */
function CoreMeasurements({
  defs,
  applications,
  crop,
  onSave,
}: {
  defs: MeasurementDef[]
  applications: Application[]
  crop: string
  onSave: (next: MeasurementDef[]) => void
}) {
  const [draft, setDraft] = useState({
    partMeasured: '',
    measurementType: '',
    measurementUnit: '',
    applicationRef: '',
    daysAfter: null as number | null,
    timing: '',
    subsamples: 1,
    formula: '',
  })
  const calc = draft.formula.trim().length > 0
  const parsed = calc ? parseFormula(draft.formula) : null
  const formulaError = parsed && !parsed.ok ? parsed.error : null

  const add = (): void => {
    const label = timingLabel(draft)
    onSave([
      ...defs,
      {
        partMeasured: draft.partMeasured,
        measurementType: draft.measurementType,
        measurementUnit: draft.measurementUnit,
        applicationRef: draft.applicationRef,
        daysAfter: draft.daysAfter,
        timing: draft.timing,
        description:
          [draft.measurementType, draft.partMeasured, label].filter(Boolean).join(' ') || 'Measurement',
        ordinal: defs.length,
        analyze: true,
        subsamples: calc ? 1 : Math.max(1, draft.subsamples || 1),
        formula: calc ? draft.formula.trim() : '',
      },
    ])
    setDraft({
      partMeasured: '',
      measurementType: '',
      measurementUnit: '',
      applicationRef: '',
      daysAfter: null,
      timing: '',
      subsamples: 1,
      formula: '',
    })
  }

  const toggleAnalyze = (i: number): void =>
    onSave(defs.map((d, idx) => (idx === i ? { ...d, analyze: !d.analyze } : d)))

  return (
    <div className="card">
      <h2>Core Measurements</h2>
      <p className="muted">
        The measurement schedule every site must collect. Sites may add their own extra columns but
        cannot change these.
      </p>
      {defs.length > 0 ? (
        <table className="data" style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th>Measurement type</th>
              <th>Part measured</th>
              <th>Unit</th>
              <th>Timing</th>
              <th style={{ width: 70 }}>Subs</th>
              <th style={{ width: 80 }}>Analyze</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {defs.map((d, i) => (
              <tr key={d.id ?? i}>
                <td>
                  {d.measurementType || '—'}
                  {d.formula && (
                    <div className="muted" style={{ fontSize: 11 }}>
                      ƒ {d.formula}
                    </div>
                  )}
                </td>
                <td>{d.partMeasured || '—'}</td>
                <td>{d.measurementUnit || '—'}</td>
                <td>{timingLabel(d) || '—'}</td>
                <td className="num">{d.formula ? '—' : (d.subsamples ?? 1)}</td>
                <td className="num">
                  <input
                    type="checkbox"
                    checked={d.analyze}
                    onChange={() => toggleAnalyze(i)}
                    title="Include this measurement in ANOVA and the report"
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
        <p className="muted">No core measurements defined yet.</p>
      )}
      <div className="row">
        <div style={{ width: 160 }}>
          <label>Measurement type</label>
          <Combobox
            category="measurement_type"
            crop={crop}
            value={draft.measurementType}
            onChange={(v) => setDraft({ ...draft, measurementType: v })}
          />
        </div>
        <div style={{ width: 160 }}>
          <label>Part measured</label>
          <Combobox
            category="part_measured"
            crop={crop}
            value={draft.partMeasured}
            onChange={(v) => setDraft({ ...draft, partMeasured: v })}
          />
        </div>
        <div style={{ width: 110 }}>
          <label>Unit</label>
          <Combobox
            category="unit"
            crop={crop}
            value={draft.measurementUnit}
            onChange={(v) => setDraft({ ...draft, measurementUnit: v })}
          />
        </div>
        <TimingField
          applications={applications}
          value={draft}
          onChange={(v) => setDraft({ ...draft, ...v })}
        />
        <div style={{ width: 90 }}>
          <label>Subsamples</label>
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
        <div style={{ flex: 1, minWidth: 200 }}>
          <label>Formula (optional → calculated column)</label>
          <input
            value={draft.formula}
            placeholder="e.g. abbott([1])  or  ([1]+[2])/2"
            onChange={(e) => setDraft({ ...draft, formula: e.target.value })}
          />
        </div>
        <button className="primary" onClick={add} disabled={!!formulaError}>
          + Add measurement
        </button>
      </div>
      {calc && (
        <div style={{ marginTop: 6, fontSize: 12 }}>
          {formulaError ? (
            <span style={{ color: '#b00020' }}>⚠ {formulaError}</span>
          ) : (
            <span className="muted">
              Reference measurements by column number —{' '}
              {defs
                .map((d, i) => `[${i + 1}] ${d.description || d.measurementType || 'Measurement'}`)
                .join('   ')}
              {defs.length === 0 && 'no measurements to reference yet'}. Use control([n]) or
              abbott([n]) for % of untreated control.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
