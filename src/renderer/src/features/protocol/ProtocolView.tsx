import { useState, useEffect } from 'react'
import { useStore } from '../../store'
import type { Protocol, Treatment, DesignType } from '@shared/types'

export function ProtocolView(): JSX.Element {
  const { snapshot, setSnapshot, run } = useStore()
  const [protocol, setProtocol] = useState<Protocol>(snapshot!.protocol)
  const [treatments, setTreatments] = useState<Treatment[]>(snapshot!.treatments)

  // Keep local editable copies in sync when a new project loads.
  useEffect(() => {
    setProtocol(snapshot!.protocol)
    setTreatments(snapshot!.treatments)
  }, [snapshot!.filePath])

  const field = (key: keyof Protocol, label: string, textarea = false): JSX.Element => (
    <div style={textarea ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}</label>
      {textarea ? (
        <textarea
          rows={3}
          value={protocol[key] as string}
          onChange={(e) => setProtocol({ ...protocol, [key]: e.target.value })}
          onBlur={saveProtocol}
        />
      ) : (
        <input
          value={protocol[key] as string}
          onChange={(e) => setProtocol({ ...protocol, [key]: e.target.value })}
          onBlur={saveProtocol}
        />
      )}
    </div>
  )

  const saveProtocol = (): void => {
    run('Saving protocol', async () => {
      const saved = await window.arm.protocol.save(protocol)
      setSnapshot({ ...snapshot!, protocol: saved })
    })
  }

  const saveTreatments = (next: Treatment[]): void => {
    setTreatments(next)
    run('Saving treatments', async () => {
      const saved = await window.arm.treatments.save(next)
      setSnapshot({ ...useStore.getState().snapshot!, treatments: saved })
    })
  }

  const addTreatment = (): void => {
    const number = treatments.length ? Math.max(...treatments.map((t) => t.number)) + 1 : 1
    saveTreatments([
      ...treatments,
      { number, name: number === 1 ? 'Untreated Check' : '', product: '', rate: '', rateUnit: '', type: '' }
    ])
  }

  const updateTreatment = (i: number, patch: Partial<Treatment>): void => {
    const next = treatments.map((t, idx) => (idx === i ? { ...t, ...patch } : t))
    setTreatments(next)
  }

  return (
    <>
      <div className="card">
        <h2>Protocol</h2>
        <div className="field-grid">
          {field('title', 'Trial title')}
          {field('crop', 'Crop')}
          {field('targetPest', 'Target pest / disease')}
          {field('investigator', 'Investigator')}
          {field('season', 'Season / year')}
          {field('objective', 'Objective')}
          {field('notes', 'Notes', true)}
        </div>
      </div>

      <div className="card">
        <h2>Treatments</h2>
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 50 }}>#</th>
              <th>Name</th>
              <th>Product</th>
              <th style={{ width: 90 }}>Rate</th>
              <th style={{ width: 90 }}>Unit</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {treatments.map((t, i) => (
              <tr key={i}>
                <td className="num">{t.number}</td>
                <td>
                  <input
                    value={t.name}
                    onChange={(e) => updateTreatment(i, { name: e.target.value })}
                    onBlur={() => saveTreatments(treatments)}
                  />
                </td>
                <td>
                  <input
                    value={t.product}
                    onChange={(e) => updateTreatment(i, { product: e.target.value })}
                    onBlur={() => saveTreatments(treatments)}
                  />
                </td>
                <td>
                  <input
                    value={t.rate}
                    onChange={(e) => updateTreatment(i, { rate: e.target.value })}
                    onBlur={() => saveTreatments(treatments)}
                  />
                </td>
                <td>
                  <input
                    value={t.rateUnit}
                    onChange={(e) => updateTreatment(i, { rateUnit: e.target.value })}
                    onBlur={() => saveTreatments(treatments)}
                  />
                </td>
                <td>
                  <button
                    title="Remove"
                    onClick={() => saveTreatments(treatments.filter((_, idx) => idx !== i))}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 10 }}>
          <button onClick={addTreatment}>+ Add treatment</button>
        </div>
      </div>

      <GenerateTrialCard />
    </>
  )
}

function GenerateTrialCard(): JSX.Element {
  const { snapshot, setSnapshot, setView, run } = useStore()
  const [design, setDesign] = useState<DesignType>('RCB')
  const [replicates, setReplicates] = useState(4)
  const [width, setWidth] = useState(0)
  const [length, setLength] = useState(0)

  const treatmentCount = snapshot!.treatments.length
  const canGenerate = treatmentCount >= 2 && replicates >= 2

  const generate = (): void => {
    run('Generating randomized trial', async () => {
      const next = await window.arm.trial.generate({
        design,
        replicates,
        plotWidth: width,
        plotLength: length
      })
      setSnapshot(next)
      setView('trialmap')
    })
  }

  return (
    <div className="card">
      <h2>Generate Randomized Trial</h2>
      {snapshot!.trial && (
        <div className="banner">
          A trial already exists ({snapshot!.trial.design}, {snapshot!.trial.replicates} reps).
          Regenerating replaces the current layout and any entered data.
        </div>
      )}
      <div className="row">
        <div style={{ width: 160 }}>
          <label>Design</label>
          <select value={design} onChange={(e) => setDesign(e.target.value as DesignType)}>
            <option value="RCB">Randomized Complete Block</option>
            <option value="CRD">Completely Randomized</option>
          </select>
        </div>
        <div style={{ width: 110 }}>
          <label>Replicates</label>
          <input
            type="number"
            min={2}
            max={20}
            value={replicates}
            onChange={(e) => setReplicates(Number(e.target.value))}
          />
        </div>
        <div style={{ width: 110 }}>
          <label>Plot width</label>
          <input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} />
        </div>
        <div style={{ width: 110 }}>
          <label>Plot length</label>
          <input type="number" value={length} onChange={(e) => setLength(Number(e.target.value))} />
        </div>
        <button className="primary" disabled={!canGenerate} onClick={generate}>
          Generate ({treatmentCount * replicates} plots)
        </button>
      </div>
      {treatmentCount < 2 && <p className="muted">Add at least 2 treatments first.</p>}
    </div>
  )
}
