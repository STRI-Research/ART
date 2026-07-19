'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, type ProtocolSummary, type TrialSummary } from '@/lib/api'

export default function Home() {
  const router = useRouter()
  const [protocols, setProtocols] = useState<ProtocolSummary[]>([])
  const [trials, setTrials] = useState<TrialSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.protocols.list().catch(() => [] as ProtocolSummary[]),
      api.trials.list().catch(() => [] as TrialSummary[]),
    ]).then(([p, t]) => {
      setProtocols(p)
      setTrials(t)
      setLoading(false)
    })
  }, [])

  const handleNewProtocol = async () => {
    const snap = await api.protocols.create()
    router.push(`/protocol/${snap.protocol.id}`)
  }

  return (
    <div className="welcome">
      <h1>ART</h1>
      <p className="muted">
        Open-source Agricultural Research Tool
        <br />
        Author protocols, distribute them to trial sites, collect data, and
        analyze with ANOVA.
      </p>
      <div className="welcome-paths">
        <div className="card">
          <h2>Author a Protocol</h2>
          <p className="muted">
            Define treatments, design, and the measurement schedule, then
            distribute the protocol to trial locations.
          </p>
          <div className="row">
            <button className="primary" onClick={handleNewProtocol}>
              New Protocol
            </button>
            <button onClick={() => router.push('/protocol')}>
              View Protocols
            </button>
          </div>
        </div>
        <div className="card">
          <h2>Run a Trial</h2>
          <p className="muted">
            Implement a protocol at your site: generate your own randomization,
            enter data, and analyze. The protocol stays locked.
          </p>
          <div className="row">
            <button className="primary" onClick={() => router.push('/trial/new')}>
              New Trial from Protocol
            </button>
            <button onClick={() => router.push('/trial')}>View Trials</button>
          </div>
        </div>
        <div className="card">
          <h2>Import a Historic Trial</h2>
          <p className="muted">
            Bring an existing trial in from an STRI assessment-sheet workbook
            (.xlsx): treatments, plots, and every dated measurement, in one step.
          </p>
          <div className="row">
            <button className="primary" onClick={() => router.push('/trial/import')}>
              Import from Spreadsheet
            </button>
          </div>
        </div>
      </div>

      {!loading && (protocols.length > 0 || trials.length > 0) && (
        <div className="welcome-recent">
          {protocols.length > 0 && (
            <div className="card" style={{ textAlign: 'left' }}>
              <h3 style={{ marginTop: 0 }}>Recent Protocols</h3>
              {protocols.slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  className="recent-item"
                  onClick={() => router.push(`/protocol/${p.id}`)}
                >
                  <span>{p.title || 'Untitled Protocol'}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {[p.crop, p.season].filter(Boolean).join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          )}
          {trials.length > 0 && (
            <div className="card" style={{ textAlign: 'left' }}>
              <h3 style={{ marginTop: 0 }}>Recent Trials</h3>
              {trials.slice(0, 5).map((t) => (
                <div
                  key={t.id}
                  className="recent-item"
                  onClick={() => router.push(`/trial/${t.id}`)}
                >
                  <span>{t.siteName || t.protocolTitle || 'Untitled Trial'}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {t.protocolTitle}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
