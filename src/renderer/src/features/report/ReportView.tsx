import { useMemo } from 'react'
import { VegaLite, type VisualizationSpec } from 'react-vega'
import { useStore } from '../../store'
import { MeansTable } from '../stats/MeansTable'

export function ReportView(): JSX.Element {
  const { snapshot, lastAov } = useStore()
  const protocol = snapshot!.protocol
  const header =
    lastAov && snapshot!.assessmentHeaders.find((h) => h.id === lastAov.headerId)

  const nameByNumber = useMemo(
    () => new Map(snapshot!.treatments.map((t) => [t.number, t.name || `Trt ${t.number}`])),
    [snapshot]
  )

  const chartData = useMemo(() => {
    if (!lastAov) return []
    return lastAov.result.means.map((m) => {
      const se = Number.isFinite(m.std) && m.n > 0 ? m.std / Math.sqrt(m.n) : 0
      return {
        treatment: `${m.treatment}. ${nameByNumber.get(m.treatment) ?? ''}`.trim(),
        mean: m.mean,
        low: m.mean - se,
        high: m.mean + se,
        group: m.group
      }
    })
  }, [lastAov, nameByNumber])

  const spec: VisualizationSpec = {
    width: 'container',
    height: 320,
    data: { name: 'means' },
    encoding: { x: { field: 'treatment', type: 'nominal', sort: null, axis: { labelAngle: -35 } } },
    layer: [
      {
        mark: { type: 'bar', color: '#2f7d4f' },
        encoding: { y: { field: 'mean', type: 'quantitative', title: 'Mean' } }
      },
      {
        mark: { type: 'errorbar', color: '#1e232b' },
        encoding: {
          y: { field: 'low', type: 'quantitative', title: 'Mean' },
          y2: { field: 'high' }
        }
      },
      {
        mark: { type: 'text', dy: -6, align: 'center', baseline: 'bottom' },
        encoding: { y: { field: 'high', type: 'quantitative' }, text: { field: 'group' } }
      }
    ]
  }

  const exportCsv = (): void => {
    if (!lastAov) return
    const rows = [
      ['treatment_number', 'treatment_name', 'mean', 'group', 'n', 'std'],
      ...lastAov.result.means.map((m) => [
        m.treatment,
        nameByNumber.get(m.treatment) ?? '',
        m.mean,
        m.group,
        m.n,
        m.std
      ])
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${protocol.title || 'trial'}-means.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Report</h2>
          <div className="row">
            <button onClick={exportCsv} disabled={!lastAov}>
              Export means CSV
            </button>
            <button className="primary" onClick={() => window.print()}>
              Print / Save PDF
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>{protocol.title || 'Untitled trial'}</h2>
        <table className="data" style={{ maxWidth: 640 }}>
          <tbody>
            <tr>
              <th style={{ width: 160 }}>Crop</th>
              <td>{protocol.crop || '—'}</td>
            </tr>
            <tr>
              <th>Target pest</th>
              <td>{protocol.targetPest || '—'}</td>
            </tr>
            <tr>
              <th>Investigator</th>
              <td>{protocol.investigator || '—'}</td>
            </tr>
            <tr>
              <th>Season</th>
              <td>{protocol.season || '—'}</td>
            </tr>
            <tr>
              <th>Design</th>
              <td>
                {snapshot!.trial!.design}, {snapshot!.trial!.replicates} replicates,{' '}
                {snapshot!.plots.length} plots
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {!lastAov ? (
        <div className="card">
          <p className="muted">Run an analysis in the Statistics tab to populate the report.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <h2>
              {header?.description || 'Assessment'} — Treatment Means (
              {lastAov.result.criticalValueLabel})
            </h2>
            <VegaLite spec={spec} data={{ means: chartData }} actions={false} />
          </div>
          <div className="card">
            <h2>Means Table</h2>
            <MeansTable result={lastAov.result} treatments={snapshot!.treatments} />
          </div>
        </>
      )}
    </>
  )
}
