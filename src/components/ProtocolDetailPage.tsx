'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, type ProtocolSnapshot } from '@/lib/api'
import type { Protocol } from '@shared/types'

const DESIGN_OPTIONS = [
  { value: 'RCB', label: 'Randomized Complete Block' },
  { value: 'CRD', label: 'Completely Randomized' },
  { value: 'ALPHA', label: 'Incomplete Block (Alpha)' },
]

export function ProtocolDetailPage({ id }: { id: number }) {
  const router = useRouter()
  const [snap, setSnap] = useState<ProtocolSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.protocols.get(id).then((s) => {
      setSnap(s)
      setLoading(false)
    })
  }, [id])

  const save = useCallback(
    async (patch: Partial<Protocol>) => {
      if (!snap) return
      setSaving(true)
      const updated = await api.protocols.save(id, {
        ...snap.protocol,
        ...patch,
      })
      setSnap((prev) => (prev ? { ...prev, protocol: updated } : prev))
      setSaving(false)
    },
    [snap, id]
  )

  const handleDelete = async () => {
    if (!confirm('Delete this protocol? This cannot be undone.')) return
    await api.protocols.delete(id)
    router.push('/protocol')
  }

  if (loading || !snap) {
    return (
      <div style={{ padding: 24 }}>
        <p className="muted">Loading…</p>
      </div>
    )
  }

  const p = snap.protocol

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <div className="cta-row" style={{ marginBottom: 20 }}>
        <button onClick={() => router.push('/protocol')}>&larr; Protocols</button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saving && <span className="muted" style={{ fontSize: 12 }}>Saving…</span>}
          <button className="danger" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Protocol Details</h2>
        <Field label="Title" value={p.title} onCommit={(v) => save({ title: v })} />
        <Field label="Investigator" value={p.investigator} onCommit={(v) => save({ investigator: v })} />
        <Field label="Season" value={p.season} onCommit={(v) => save({ season: v })} />
        <Field label="Crop" value={p.crop} onCommit={(v) => save({ crop: v })} />
        <Field label="Target Pest" value={p.targetPest} onCommit={(v) => save({ targetPest: v })} />
        <Field label="Objective" value={p.objective} onCommit={(v) => save({ objective: v })} multiline />
        <Field label="Notes" value={p.notes} onCommit={(v) => save({ notes: v })} multiline />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Experimental Design</h2>
        <div className="field-row">
          <label className="field-label">Design</label>
          <select
            value={p.design}
            onChange={(e) => save({ design: e.target.value as Protocol['design'] })}
          >
            {DESIGN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <NumberField label="Replicates" value={p.replicates} onCommit={(v) => save({ replicates: v })} min={2} max={20} />
        {p.design === 'ALPHA' && (
          <NumberField label="Block Size" value={p.blockSize} onCommit={(v) => save({ blockSize: v })} min={2} />
        )}
        <NumberField label="Plot Width" value={p.plotWidth} onCommit={(v) => save({ plotWidth: v })} step={0.1} />
        <NumberField label="Plot Length" value={p.plotLength} onCommit={(v) => save({ plotLength: v })} step={0.1} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>
          Treatments ({snap.treatments.length})
        </h2>
        {snap.treatments.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            No treatments defined yet.
          </p>
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #ddd)' }}>
                <th style={{ padding: '4px 8px', width: 40 }}>#</th>
                <th style={{ padding: '4px 8px' }}>Name</th>
                <th style={{ padding: '4px 8px', width: 60 }}>Check</th>
              </tr>
            </thead>
            <tbody>
              {snap.treatments.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border, #eee)' }}>
                  <td style={{ padding: '4px 8px' }}>{t.number}</td>
                  <td style={{ padding: '4px 8px' }}>{t.name || '—'}</td>
                  <td style={{ padding: '4px 8px' }}>{t.isCheck ? 'Yes' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>
          Measurement Definitions ({snap.measurementDefs.length})
        </h2>
        {snap.measurementDefs.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            No measurements defined yet.
          </p>
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #ddd)' }}>
                <th style={{ padding: '4px 8px' }}>Type</th>
                <th style={{ padding: '4px 8px' }}>Part</th>
                <th style={{ padding: '4px 8px' }}>Unit</th>
                <th style={{ padding: '4px 8px' }}>Timing</th>
              </tr>
            </thead>
            <tbody>
              {snap.measurementDefs.map((m) => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border, #eee)' }}>
                  <td style={{ padding: '4px 8px' }}>{m.measurementType || '—'}</td>
                  <td style={{ padding: '4px 8px' }}>{m.partMeasured || '—'}</td>
                  <td style={{ padding: '4px 8px' }}>{m.measurementUnit || '—'}</td>
                  <td style={{ padding: '4px 8px' }}>{m.timing || (m.applicationRef ? `${m.daysAfter ?? 0} DA-${m.applicationRef}` : '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onCommit,
  multiline,
}: {
  label: string
  value: string
  onCommit: (v: string) => void
  multiline?: boolean
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])

  const commit = () => {
    if (local !== value) onCommit(local)
  }

  const Tag = multiline ? 'textarea' : 'input'
  return (
    <div className="field-row">
      <label className="field-label">{label}</label>
      <Tag
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        {...(multiline ? { rows: 3 } : {})}
        style={{ width: '100%' }}
      />
    </div>
  )
}

function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step,
}: {
  label: string
  value: number
  onCommit: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  const [local, setLocal] = useState(String(value))
  useEffect(() => setLocal(String(value)), [value])

  const commit = () => {
    const n = Number(local)
    if (!isNaN(n) && n !== value) onCommit(n)
  }

  return (
    <div className="field-row">
      <label className="field-label">{label}</label>
      <input
        type="number"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        min={min}
        max={max}
        step={step}
        style={{ width: 120 }}
      />
    </div>
  )
}
