'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, type TrialSummary, type ProtocolSummary } from '@/lib/api'

export default function TrialListPage() {
  const router = useRouter()
  const [trials, setTrials] = useState<TrialSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.trials.list().then((t) => {
      setTrials(t)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <p className="muted">Loading trials…</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <div className="cta-row" style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Trials</h1>
        <button
          className="primary"
          onClick={() => router.push('/trial/new')}
        >
          + New Trial
        </button>
      </div>

      {trials.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p className="muted">
            No trials yet. Create one from a protocol to begin your field
            experiment.
          </p>
          <button
            className="primary"
            style={{ marginTop: 12 }}
            onClick={() => router.push('/trial/new')}
          >
            Create Your First Trial
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {trials.map((t) => (
            <div
              key={t.id}
              className="card"
              style={{ cursor: 'pointer', marginBottom: 0 }}
              onClick={() => router.push(`/trial/${t.id}`)}
            >
              <div className="cta-row">
                <div>
                  <h2 style={{ margin: 0, fontSize: 16 }}>
                    {t.siteName || t.protocolTitle || 'Untitled Trial'}
                  </h2>
                  <p
                    className="muted"
                    style={{ fontSize: 12, marginTop: 4 }}
                  >
                    {[
                      t.protocolTitle ? `Protocol: ${t.protocolTitle}` : null,
                      t.plotCount > 0 ? `${t.plotCount} plots` : 'No layout',
                      t.layoutLockedAt ? 'Locked' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <span className="role-badge trial">Trial</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
