import { useState } from 'react'
import { useStore } from '../../store'
import type { AssessmentHeader } from '@shared/types'

export function AssessmentsView(): JSX.Element {
  const snapshot = useStore((s) => s.snapshot)
  const trial = snapshot!.trial!
  const headers = snapshot!.assessmentHeaders
  return <HeaderManager trialId={trial.id!} headers={headers} />
}

function HeaderManager({
  trialId,
  headers
}: {
  trialId: number
  headers: AssessmentHeader[]
}): JSX.Element {
  const { snapshot, setSnapshot, run } = useStore()
  const [draft, setDraft] = useState({
    partRated: '',
    ratingType: '',
    ratingUnit: '',
    timing: '',
    analyze: true,
    subsamples: 1
  })

  const add = (): void => {
    run('Adding assessment', async () => {
      const next = await window.art.assessments.addSiteHeader({
        trialId,
        partRated: draft.partRated,
        ratingType: draft.ratingType,
        ratingUnit: draft.ratingUnit,
        timing: draft.timing,
        ratingDate: '',
        description:
          [draft.ratingType, draft.partRated, draft.timing].filter(Boolean).join(' ') || 'Assessment',
        ordinal: headers.length,
        origin: 'site',
        locked: false,
        analyze: draft.analyze,
        subsamples: Math.max(1, draft.subsamples || 1)
      })
      setSnapshot({ ...snapshot!, assessmentHeaders: next })
      setDraft({ partRated: '', ratingType: '', ratingUnit: '', timing: '', analyze: true, subsamples: 1 })
    })
  }

  const setSubsamples = (h: AssessmentHeader, n: number): void => {
    run('Updating assessment', async () => {
      const next = await window.art.assessments.upsertHeader({ ...h, subsamples: Math.max(1, n || 1) })
      setSnapshot({ ...snapshot!, assessmentHeaders: next })
    })
  }

  const remove = (id: number): void => {
    run('Removing assessment', async () => {
      const next = await window.art.assessments.deleteHeader(id)
      setSnapshot({ ...snapshot!, assessmentHeaders: next })
    })
  }

  const toggleAnalyze = (h: AssessmentHeader): void => {
    run('Updating assessment', async () => {
      const next = await window.art.assessments.upsertHeader({ ...h, analyze: !h.analyze })
      setSnapshot({ ...snapshot!, assessmentHeaders: next })
    })
  }

  return (
    <div className="card">
      <h2>Assessment Columns</h2>
      <p className="muted">
        Core columns are defined by the protocol (locked). You may add site-specific columns below.
      </p>
      {headers.length > 0 && (
        <table className="data" style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 70 }}>Source</th>
              <th>Rating type</th>
              <th>Part rated</th>
              <th>Unit</th>
              <th>Timing</th>
              <th style={{ width: 70 }}>Subs</th>
              <th style={{ width: 70 }}>Analyze</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {headers.map((h) => (
              <tr key={h.id}>
                <td>
                  {h.origin === 'core' ? (
                    <span className="tag core">🔒 core</span>
                  ) : (
                    <span className="tag site">site</span>
                  )}
                </td>
                <td>{h.ratingType || '—'}</td>
                <td>{h.partRated || '—'}</td>
                <td>{h.ratingUnit || '—'}</td>
                <td>{h.timing || '—'}</td>
                <td className="num">
                  {h.origin === 'core' ? (
                    h.subsamples ?? 1
                  ) : (
                    <input
                      type="number"
                      min={1}
                      max={50}
                      style={{ width: 52 }}
                      value={h.subsamples ?? 1}
                      onChange={(e) => setSubsamples(h, Number(e.target.value))}
                      title="Measurements recorded per plot (averaged for analysis)"
                    />
                  )}
                </td>
                <td className="num">
                  <input
                    type="checkbox"
                    checked={h.analyze}
                    disabled={h.origin === 'core'}
                    onChange={() => toggleAnalyze(h)}
                    title={
                      h.origin === 'core'
                        ? 'Set by the protocol'
                        : 'Include this assessment in ANOVA and the report'
                    }
                  />
                </td>
                <td>{h.origin === 'core' || h.locked ? null : <button onClick={() => remove(h.id!)}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row">
        <div style={{ width: 160 }}>
          <label>Rating type</label>
          <input
            placeholder="e.g. CONTRO, PHYGEN"
            value={draft.ratingType}
            onChange={(e) => setDraft({ ...draft, ratingType: e.target.value })}
          />
        </div>
        <div style={{ width: 160 }}>
          <label>Part rated</label>
          <input
            placeholder="e.g. PLANT, LEAF"
            value={draft.partRated}
            onChange={(e) => setDraft({ ...draft, partRated: e.target.value })}
          />
        </div>
        <div style={{ width: 110 }}>
          <label>Unit</label>
          <input
            placeholder="%, count"
            value={draft.ratingUnit}
            onChange={(e) => setDraft({ ...draft, ratingUnit: e.target.value })}
          />
        </div>
        <div style={{ width: 130 }}>
          <label>Timing</label>
          <input
            placeholder="e.g. 14 DA-A"
            value={draft.timing}
            onChange={(e) => setDraft({ ...draft, timing: e.target.value })}
          />
        </div>
        <div style={{ width: 90 }}>
          <label>Subsamples</label>
          <input
            type="number"
            min={1}
            max={50}
            value={draft.subsamples}
            onChange={(e) => setDraft({ ...draft, subsamples: Number(e.target.value) })}
          />
        </div>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={draft.analyze}
            onChange={(e) => setDraft({ ...draft, analyze: e.target.checked })}
          />
          Analyze
        </label>
        <button className="primary" onClick={add}>
          + Add column
        </button>
      </div>
    </div>
  )
}
