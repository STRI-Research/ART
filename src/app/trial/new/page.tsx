'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, type ProtocolSummary } from '@/lib/api'

export default function NewTrialPage() {
  const router = useRouter()
  const [protocols, setProtocols] = useState<ProtocolSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.protocols.list().then((p) => {
      setProtocols(p)
      setLoading(false)
    })
  }, [])

  const handleCreate = async (protocolId: number) => {
    setCreating(true)
    try {
      const snap = await api.trials.create(protocolId)
      router.push(`/trial/${snap.trial.id}`)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to create trial')
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <p className="muted">Loading protocols…</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <div className="cta-row" style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>New Trial from Protocol</h1>
        <button onClick={() => router.back()}>&larr; Back</button>
      </div>

      {protocols.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p className="muted">
            No protocols available. Create a protocol first, then come back to
            start a trial.
          </p>
          <button
            className="primary"
            style={{ marginTop: 12 }}
            onClick={() => router.push('/protocol')}
          >
            Go to Protocols
          </button>
        </div>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 16 }}>
            Select a protocol to implement at your site. The protocol&apos;s
            treatments, design, and measurement schedule will be locked into the
            new trial.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {protocols.map((p) => (
              <div key={p.id} className="card" style={{ marginBottom: 0 }}>
                <div className="cta-row">
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16 }}>
                      {p.title || 'Untitled Protocol'}
                    </h2>
                    <p
                      className="muted"
                      style={{ fontSize: 12, marginTop: 4 }}
                    >
                      {[
                        p.crop,
                        p.design,
                        p.treatmentCount > 0
                          ? `${p.treatmentCount} treatments`
                          : null,
                        p.season,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <button
                    className="primary"
                    disabled={creating}
                    onClick={() => handleCreate(p.id)}
                  >
                    {creating ? 'Creating…' : 'Create Trial'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
