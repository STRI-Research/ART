'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface ApplyRecord {
  documentRef: string
  documentVersion: number
  documentStatus: string
  trialId: number
  siteName: string
  event: {
    id: number
    label: string
    plannedDate: string
    actualDate: string
    executionStatus: string
    evidenceStatus: string
  }
  evidence: {
    id: number
    fileName: string
    blobUrl: string
    uploadedAt: string
    replacedById: number
  }[]
}

/**
 * The QR-landed page (brief §23): scanning the code on a printed application pack opens this
 * exact application record, where the completed signed paper document is photographed or
 * uploaded. Mobile-friendly; the camera opens directly via the file input's capture hint.
 */
export function ApplyUploadPage({ documentRef }: { documentRef: string }) {
  const [record, setRecord] = useState<ApplyRecord | null>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback((): void => {
    fetch(`/api/apply/${encodeURIComponent(documentRef)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text())
        return r.json() as Promise<ApplyRecord>
      })
      .then(setRecord)
      .catch((e: Error) => {
        try {
          setError(JSON.parse(e.message).error ?? e.message)
        } catch {
          setError(e.message)
        }
      })
  }, [documentRef])

  useEffect(load, [load])

  const upload = (file: File): void => {
    if (!record) return
    setUploading(true)
    setError('')
    const form = new FormData()
    form.append('file', file)
    fetch(`/api/trial/${record.trialId}/event/${record.event.id}/evidence`, {
      method: 'POST',
      body: form,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text())
        load()
      })
      .catch((e: Error) => {
        try {
          setError(JSON.parse(e.message).error ?? e.message)
        } catch {
          setError(e.message)
        }
      })
      .finally(() => setUploading(false))
  }

  if (error && !record) {
    return (
      <div style={{ padding: 24, maxWidth: 520, margin: '0 auto' }}>
        <p style={{ color: 'var(--danger, #b00020)' }}>⚠ {error}</p>
      </div>
    )
  }
  if (!record) {
    return (
      <div style={{ padding: 24 }}>
        <p className="muted">Loading application record…</p>
      </div>
    )
  }

  const live = record.evidence.filter((e) => !e.replacedById)
  const replaced = record.evidence.filter((e) => e.replacedById)
  const completed = record.event.executionStatus !== 'pending'

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px' }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Application {record.event.label}</h2>
        <table style={{ fontSize: 13 }}>
          <tbody>
            {[
              ['Document', `${record.documentRef} (v${record.documentVersion})`],
              ['Site', record.siteName || '—'],
              ['Planned date', record.event.plannedDate || '—'],
              ['Actual date', record.event.actualDate || 'not recorded yet'],
              ['Status', completed ? 'Completed' : 'Not completed'],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ paddingRight: 16, color: '#555', paddingBottom: 2 }}>{k}</td>
                <td style={{ paddingBottom: 2 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 13, marginTop: 8 }}>
          <a href={`/trial/${record.trialId}`}>Open the full trial →</a>
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Signed application document</h2>
        {error && <p style={{ color: 'var(--danger, #b00020)', fontSize: 13 }}>⚠ {error}</p>}
        {!completed && (
          <p style={{ fontSize: 13, color: '#9a6700' }}>
            ⚠ Record the application as completed (trial → Schedule) before uploading the signed
            record.
          </p>
        )}
        {live.length > 0 ? (
          <ul style={{ paddingLeft: 18, fontSize: 13 }}>
            {live.map((e) => (
              <li key={e.id}>
                <a href={e.blobUrl} target="_blank" rel="noreferrer">
                  {e.fileName}
                </a>{' '}
                <span className="muted">({new Date(e.uploadedAt).toLocaleString()})</span>
              </li>
            ))}
          </ul>
        ) : (
          completed && (
            <p style={{ fontSize: 13, color: '#9a6700' }}>
              ⚠ Signed application document missing — photograph or upload the completed paper
              record.
            </p>
          )
        )}
        {completed && (
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) upload(f)
                e.target.value = ''
              }}
            />
            <button
              className="primary"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
              style={{ width: '100%', padding: '12px 0', fontSize: 15 }}
            >
              {uploading
                ? 'Uploading…'
                : live.length > 0
                  ? 'Replace signed document'
                  : '📷 Photograph / upload signed document'}
            </button>
          </>
        )}
        {replaced.length > 0 && (
          <details style={{ marginTop: 10, fontSize: 12 }}>
            <summary className="muted">Replaced versions ({replaced.length})</summary>
            <ul style={{ paddingLeft: 18 }}>
              {replaced.map((e) => (
                <li key={e.id}>
                  <a href={e.blobUrl} target="_blank" rel="noreferrer">
                    {e.fileName}
                  </a>{' '}
                  <span className="muted">({new Date(e.uploadedAt).toLocaleString()})</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}
