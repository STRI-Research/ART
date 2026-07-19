'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, type TrialSnapshot } from '@/lib/api'
import { StatsView } from '@/components/StatsView'
import { ReportView } from '@/components/ReportView'
import { DocumentsView } from '@/components/DocumentsView'
import { AuditView } from '@/components/AuditView'
import { SiteView } from '@/components/SiteView'
import { ApplicationsView } from '@/components/ApplicationsView'
import { TrialMapView } from '@/components/TrialMapView'
import { MeasurementsView } from '@/components/MeasurementsView'
import { DataEntryView } from '@/components/DataEntryView'

type ViewId =
  | 'protocol'
  | 'site'
  | 'trialmap'
  | 'applications'
  | 'measurements'
  | 'dataentry'
  | 'stats'
  | 'report'
  | 'documents'
  | 'audit'

interface NavItem {
  id: ViewId
  label: string
  needsLock?: boolean
  step?: number
}

const NAV: NavItem[] = [
  { id: 'protocol', label: 'Protocol (locked)' },
  { id: 'site', label: 'Site', step: 1 },
  { id: 'trialmap', label: 'Trial Map', step: 2 },
  { id: 'applications', label: 'Applications', step: 3 },
  { id: 'measurements', label: 'Measurements', step: 4, needsLock: true },
  { id: 'dataentry', label: 'Enter Data', step: 5, needsLock: true },
  { id: 'stats', label: 'Statistics', step: 6, needsLock: true },
  { id: 'report', label: 'Report', step: 7, needsLock: true },
  { id: 'documents', label: 'Documents' },
  { id: 'audit', label: 'Audit Log' },
]

export function TrialDetailPage({ id }: { id: number }) {
  const [snap, setSnap] = useState<TrialSnapshot | null>(null)
  const [view, setView] = useState<ViewId>('site')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const reload = useCallback(async () => {
    try {
      const s = await api.trials.get(id)
      setSnap(s)
      return s
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trial')
      return null
    }
  }, [id])

  useEffect(() => {
    reload().then((s) => {
      setLoading(false)
      if (s && s.plots.length > 0) setView('trialmap')
    })
  }, [reload])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 3000)
    return () => clearTimeout(t)
  }, [notice])

  if (loading || !snap) {
    return (
      <div style={{ padding: 24 }}>
        <p className="muted">Loading trial…</p>
      </div>
    )
  }

  const layoutLocked = !!snap.trial.layoutLockedAt

  const stepDone = (navId: ViewId): boolean =>
    (navId === 'site' && !!snap.trial.siteName) ||
    (navId === 'trialmap' && layoutLocked)

  return (
    <div className={`trial-layout${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
      <nav className="sidebar">
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? '◀' : '▶'}
        </button>
        {NAV.map((n) => {
          const disabled = n.needsLock && !layoutLocked
          const done = stepDone(n.id)
          const badge = n.step
            ? done
              ? '✓'
              : disabled
                ? '🔒'
                : String(n.step)
            : null
          return (
            <button
              key={n.id}
              className={`nav-item${view === n.id ? ' active' : ''}${disabled ? ' locked' : ''}${done ? ' done' : ''}`}
              disabled={disabled}
              title={disabled ? 'Confirm & lock the layout first' : undefined}
              onClick={() => setView(n.id)}
            >
              {badge && <span className="nav-step">{badge}</span>}
              {n.label}
            </button>
          )
        })}
      </nav>

      <div className="main">
        {view === 'protocol' && <ProtocolReadOnly snap={snap} />}
        {view === 'site' && (
          <SiteView
            trialId={snap.trial.id!}
            snapshot={snap}
            onSnapshotChange={setSnap}
          />
        )}
        {view === 'trialmap' && (
          <TrialMapView
            trialId={snap.trial.id!}
            snapshot={snap}
            onSnapshotChange={setSnap}
          />
        )}
        {view === 'applications' && (
          <ApplicationsView
            trialId={snap.trial.id!}
            snapshot={snap}
            onSnapshotChange={setSnap}
          />
        )}
        {view === 'measurements' && (
          <MeasurementsView
            trialId={snap.trial.id!}
            crop={snap.protocol.crop}
            headers={snap.measurementHeaders}
            applications={snap.applications}
            onHeadersChange={(measurementHeaders) =>
              setSnap({ ...snap, measurementHeaders })
            }
            onEnterData={() => setView('dataentry')}
          />
        )}
        {view === 'dataentry' && (
          <DataEntryView
            trialId={snap.trial.id!}
            crop={snap.protocol.crop}
            headers={snap.measurementHeaders}
            plots={snap.plots}
            treatments={snap.treatments}
            values={snap.measurementValues}
            onHeadersChange={(measurementHeaders) =>
              setSnap({ ...snap, measurementHeaders })
            }
            onValuesChange={(measurementValues) =>
              setSnap({ ...snap, measurementValues })
            }
            onEditColumns={() => setView('measurements')}
            onAnalyze={() => setView('stats')}
          />
        )}
        {view === 'stats' && (
          <StatsView trialId={snap.trial.id!} onOpenReport={() => setView('report')} />
        )}
        {view === 'report' && <ReportView trialId={snap.trial.id!} />}
        {view === 'documents' && <DocumentsView trialId={snap.trial.id!} />}
        {view === 'audit' && <AuditView trialId={id} />}
      </div>

      {error && (
        <div className="error-toast" onClick={() => setError(null)}>
          {error}{' '}
          <span style={{ opacity: 0.7 }}>(click to dismiss)</span>
        </div>
      )}
      {notice && !error && (
        <div className="notice-toast" onClick={() => setNotice(null)}>
          {notice}{' '}
          <span style={{ opacity: 0.7 }}>(click to dismiss)</span>
        </div>
      )}
    </div>
  )
}

function ProtocolReadOnly({ snap }: { snap: TrialSnapshot }) {
  return (
    <div style={{ maxWidth: 800 }}>
      <div className="banner locked">
        This protocol is locked. Changes must be made in the original protocol
        document.
      </div>
      <div className="card">
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Protocol Details</h2>
        <table style={{ fontSize: 13 }}>
          <tbody>
            {[
              ['Title', snap.protocol.title],
              ['Investigator', snap.protocol.investigator],
              ['Crop', snap.protocol.crop],
              ['Season', snap.protocol.season],
              ['Target Pest', snap.protocol.targetPest],
              ['Design', snap.protocol.design],
              ['Replicates', String(snap.protocol.replicates)],
            ].map(([k, v]) => (
              <tr key={k}>
                <td
                  style={{
                    fontWeight: 550,
                    color: 'var(--muted)',
                    paddingRight: 16,
                    paddingBottom: 4,
                  }}
                >
                  {k}
                </td>
                <td style={{ paddingBottom: 4 }}>{v || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>
          Treatments ({snap.treatments.length})
        </h2>
        {snap.treatments.length > 0 && (
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Name</th>
                <th style={{ width: 60 }}>Check</th>
              </tr>
            </thead>
            <tbody>
              {snap.treatments.map((t) => (
                <tr key={t.id ?? t.number}>
                  <td>{t.number}</td>
                  <td>{t.name || '—'}</td>
                  <td>{t.isCheck ? 'Yes' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>
          Measurement Definitions ({snap.measurementDefs.length})
        </h2>
        {snap.measurementDefs.length > 0 && (
          <table className="data">
            <thead>
              <tr>
                <th>Type</th>
                <th>Part</th>
                <th>Unit</th>
                <th>Timing</th>
              </tr>
            </thead>
            <tbody>
              {snap.measurementDefs.map((m) => (
                <tr key={m.id ?? m.ordinal}>
                  <td>{m.measurementType || '—'}</td>
                  <td>{m.partMeasured || '—'}</td>
                  <td>{m.measurementUnit || '—'}</td>
                  <td>
                    {m.timing ||
                      (m.applicationRef
                        ? `${m.daysAfter ?? 0} DA-${m.applicationRef}`
                        : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

