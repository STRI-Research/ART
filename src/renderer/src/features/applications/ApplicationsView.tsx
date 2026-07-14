import { useStore } from '../../store'
import { PropertyList } from '../../components/PropertyList'

/** Trial-only view: record when each protocol application actually happened at this site (measurement
 *  dates timed "N days after" derive from these) and the conditions it was made under. Shows the
 *  protocol's application detail and a treatment-program summary for context. */
export function ApplicationsView(): JSX.Element {
  const { snapshot, setSnapshot, run } = useStore()
  const applications = snapshot!.applications
  const treatments = snapshot!.treatments

  const actualDate = (code: string): string =>
    snapshot!.applicationActuals.find((a) => a.timingCode === code)?.actualDate ?? ''
  const setActualDate = (code: string, date: string): void => {
    const others = snapshot!.applicationActuals.filter((a) => a.timingCode !== code)
    run('Recording application date', async () =>
      setSnapshot(
        await window.art.trial.saveApplicationActuals([
          ...others.map((a) => ({ timingCode: a.timingCode, actualDate: a.actualDate })),
          { timingCode: code, actualDate: date }
        ])
      )
    )
  }

  return (
    <>
      <div className="card">
        <h2>Applications</h2>
        {applications.length === 0 ? (
          <p className="muted">
            This protocol defines no applications, so there is nothing to record here. Applications
            are set by the protocol author.
          </p>
        ) : (
          <>
            <p className="muted">
              When each protocol application actually happened at this site (measurement dates timed
              &quot;N days after&quot; derive from these), and the conditions it was made under.
            </p>
            {applications.map((a) => (
              <div key={a.id ?? a.timingCode} className="appl-record">
                <div className="row" style={{ alignItems: 'flex-end', gap: 20 }}>
                  <div style={{ flex: 1 }}>
                    <strong>Application {a.timingCode}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Target timing / growth stage: {a.targetGrowthStage || '—'}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Description: {a.description || '—'}
                    </div>
                  </div>
                  <div style={{ width: 150 }}>
                    <label>Actual date</label>
                    <input
                      type="date"
                      value={actualDate(a.timingCode)}
                      onChange={(e) => setActualDate(a.timingCode, e.target.value)}
                    />
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                    Conditions
                  </div>
                  <PropertyList scope="application" scopeRef={a.timingCode} addLabel="+ Add condition" />
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="card">
        <h2>Treatments</h2>
        <p className="muted">
          The protocol&apos;s treatment programs — the products, rates, and application timings being
          compared at this site.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Name</th>
              <th style={{ width: 70 }}>Timing</th>
              <th>Product</th>
              <th>Rate</th>
            </tr>
          </thead>
          <tbody>
            {treatments.map((t) =>
              t.applications.length === 0 ? (
                <tr key={t.number}>
                  <td className="num">{t.number}</td>
                  <td>{t.name || `Treatment ${t.number}`}</td>
                  <td>—</td>
                  <td className="muted">untreated</td>
                  <td>—</td>
                </tr>
              ) : (
                t.applications.map((l, li) => (
                  <tr key={`${t.number}-${li}`}>
                    {li === 0 ? (
                      <>
                        <td className="num" rowSpan={t.applications.length}>
                          {t.number}
                        </td>
                        <td rowSpan={t.applications.length}>{t.name || `Treatment ${t.number}`}</td>
                      </>
                    ) : null}
                    <td>{l.applicationRef || '—'}</td>
                    <td>{l.product || '—'}</td>
                    <td>{[l.rate, l.rateUnit].filter(Boolean).join(' ') || '—'}</td>
                  </tr>
                ))
              )
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
