import { useEffect } from 'react'
import { useStore, type ViewId } from './store'
import { ProtocolView } from './features/protocol/ProtocolView'
import { TrialMapView } from './features/trialmap/TrialMapView'
import { AssessmentsView } from './features/assessments/AssessmentsView'
import { StatsView } from './features/stats/StatsView'
import { ReportView } from './features/report/ReportView'
import { REnvBanner } from './components/REnvBanner'

const NAV: { id: ViewId; label: string; needsTrial?: boolean }[] = [
  { id: 'protocol', label: '1 · Protocol' },
  { id: 'trialmap', label: '2 · Trial Map', needsTrial: true },
  { id: 'assessments', label: '3 · Assessments', needsTrial: true },
  { id: 'stats', label: '4 · Statistics', needsTrial: true },
  { id: 'report', label: '5 · Report', needsTrial: true }
]

function Welcome(): JSX.Element {
  const { setSnapshot, run } = useStore()
  return (
    <div className="welcome">
      <h1>Open ARM</h1>
      <p className="muted">
        Open-source Agricultural Research Manager
        <br />
        Plan protocols, randomize trials, collect data, and analyze with ANOVA.
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button
          className="primary"
          onClick={() => run('Creating project', async () => setSnapshot(await window.arm.project.new()))}
        >
          New Project
        </button>
        <button
          onClick={() => run('Opening project', async () => setSnapshot(await window.arm.project.open()))}
        >
          Open Project…
        </button>
      </div>
    </div>
  )
}

export default function App(): JSX.Element {
  const { snapshot, view, setView, setSnapshot, setREnv, busy, error, setError, run } = useStore()

  useEffect(() => {
    window.arm.env.detectR().then(setREnv)
    window.arm.project.snapshot().then((s) => s && setSnapshot(s))
  }, [setREnv, setSnapshot])

  const hasTrial = !!snapshot?.trial

  return (
    <div className="app">
      {busy && <div className="busy-bar" title={busy} />}
      <header className="app-header">
        <h1>Open ARM</h1>
        {snapshot && <span className="file">{snapshot.filePath}</span>}
        <div className="spacer" />
        {busy && <span className="muted">{busy}…</span>}
        {snapshot && (
          <>
            <button
              onClick={() =>
                run('Creating project', async () => setSnapshot(await window.arm.project.new()))
              }
            >
              New
            </button>
            <button
              onClick={() =>
                run('Opening project', async () => setSnapshot(await window.arm.project.open()))
              }
            >
              Open…
            </button>
          </>
        )}
      </header>

      <nav className="sidebar">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${view === n.id ? 'active' : ''}`}
            disabled={!snapshot || (n.needsTrial && !hasTrial)}
            onClick={() => setView(n.id)}
          >
            {n.label}
          </button>
        ))}
      </nav>

      <main className="main">
        {!snapshot ? (
          <Welcome />
        ) : (
          <>
            <REnvBanner />
            {view === 'protocol' && <ProtocolView />}
            {view === 'trialmap' && <TrialMapView />}
            {view === 'assessments' && <AssessmentsView />}
            {view === 'stats' && <StatsView />}
            {view === 'report' && <ReportView />}
          </>
        )}
      </main>

      {error && (
        <div className="error-toast" onClick={() => setError(null)}>
          {error} <span style={{ opacity: 0.7 }}>(click to dismiss)</span>
        </div>
      )}
    </div>
  )
}
