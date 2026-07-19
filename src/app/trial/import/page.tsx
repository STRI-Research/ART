'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ImportSummary {
  treatments: number
  reps: number
  plots: number
  dates: number
  measurementTypes: string[]
  columns: number
  values: number
  missingTreatmentNames: number[]
}

interface ImportResponse {
  trialId: number
  headerCount: number
  valueCount: number
  title: string
  summary: ImportSummary
}

export default function ImportSheetPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResponse | null>(null)

  const submit = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      if (title.trim()) form.append('title', title.trim())
      const res = await fetch('/api/import/assessment-sheet', { method: 'POST', body: form })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Import failed')
      setResult(body as ImportResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
      <div className="cta-row" style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Import assessment sheet</h1>
        <button className="link" onClick={() => router.push('/trial')}>
          ← Trials
        </button>
      </div>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Import a historic trial from an STRI assessment-sheet workbook (.xlsx): one sheet per
          assessment date plus a Trial Plan sheet. It creates the protocol, treatments, plots, and a
          date-stamped column for every measurement.
        </p>

        <label>Workbook (.xlsx)</label>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            setResult(null)
            setError(null)
          }}
        />

        <div style={{ marginTop: 12 }}>
          <label>Title (optional — defaults to the workbook&apos;s Trial Name)</label>
          <input
            type="text"
            value={title}
            placeholder="e.g. STRI Dollar Spot Curative"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <button className="primary" disabled={!file || busy} onClick={submit}>
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>

        {error && (
          <p style={{ color: 'var(--danger)', marginBottom: 0, marginTop: 12 }}>{error}</p>
        )}

        {result && (
          <div className="card" style={{ marginTop: 16, background: 'var(--surface-2, #f6f8fa)' }}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Imported “{result.title}”</h2>
            <p className="muted" style={{ fontSize: 13 }}>
              {result.summary.treatments} treatments · {result.summary.reps} reps ·{' '}
              {result.summary.plots} plots · {result.summary.dates} dates ·{' '}
              {result.summary.measurementTypes.length} measurement types →{' '}
              {result.headerCount} columns · {result.valueCount} values.
            </p>
            {result.summary.missingTreatmentNames.length > 0 && (
              <p className="muted" style={{ fontSize: 12 }}>
                No Trial Plan name for treatment(s){' '}
                {result.summary.missingTreatmentNames.join(', ')} — used “Treatment N”.
              </p>
            )}
            <button className="primary" onClick={() => router.push(`/trial/${result.trialId}`)}>
              Open trial →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
