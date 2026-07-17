'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, type ProtocolSummary } from '@/lib/api'

const DESIGN_LABELS: Record<string, string> = {
  RCB: 'Randomized Complete Block',
  CRD: 'Completely Randomized',
  ALPHA: 'Incomplete Block (Alpha)',
}

export function ProtocolListPage() {
  const router = useRouter()
  const [protocols, setProtocols] = useState<ProtocolSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.protocols.list().then((p) => {
      setProtocols(p)
      setLoading(false)
    })
  }, [])

  const handleCreate = async () => {
    const snap = await api.protocols.create()
    router.push(`/protocol/${snap.protocol.id}`)
  }

  if (loading) {
    return (
      <div className="main" style={{ padding: 24 }}>
        <p className="muted">Loading protocols…</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <div
        className="cta-row"
        style={{ marginBottom: 20 }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>Protocols</h1>
        <button className="primary" onClick={handleCreate}>
          + New Protocol
        </button>
      </div>

      {protocols.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p className="muted">
            No protocols yet. Create one to define treatments, design, and the
            measurement schedule.
          </p>
          <button
            className="primary"
            style={{ marginTop: 12 }}
            onClick={handleCreate}
          >
            Create Your First Protocol
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {protocols.map((p) => (
            <div
              key={p.id}
              className="card"
              style={{ cursor: 'pointer', marginBottom: 0 }}
              onClick={() => router.push(`/protocol/${p.id}`)}
            >
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
                      DESIGN_LABELS[p.design] ?? p.design,
                      p.treatmentCount > 0
                        ? `${p.treatmentCount} treatments`
                        : null,
                      p.season,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <span className="role-badge protocol">Protocol</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
