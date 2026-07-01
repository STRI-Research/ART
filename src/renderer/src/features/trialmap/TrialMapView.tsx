import { useState, useMemo } from 'react'
import { useStore } from '../../store'

export function TrialMapView(): JSX.Element {
  const { snapshot, setSnapshot, run } = useStore()
  const [selected, setSelected] = useState<number | null>(null)
  const trial = snapshot!.trial!
  const plots = snapshot!.plots

  const treatmentName = useMemo(() => {
    const m = new Map(snapshot!.treatments.map((t) => [t.id!, t]))
    return (id: number): string => {
      const t = m.get(id)
      return t ? `${t.number}. ${t.name || 'Trt ' + t.number}` : `#${id}`
    }
  }, [snapshot])

  const onCellClick = (plotId: number): void => {
    if (selected === null) {
      setSelected(plotId)
      return
    }
    if (selected === plotId) {
      setSelected(null)
      return
    }
    const a = selected
    setSelected(null)
    run('Swapping plots', async () => setSnapshot(await window.arm.trial.swapPlots(a, plotId)))
  }

  // Order plots into the map grid.
  const grid: (typeof plots)[number][][] = Array.from({ length: trial.plotRows }, () => [])
  for (const p of plots) grid[p.mapRow] = grid[p.mapRow] || []
  for (const p of plots) grid[p.mapRow][p.mapCol] = p

  return (
    <div className="card">
      <h2>
        Trial Map — {trial.design}, {trial.replicates} reps, {plots.length} plots
      </h2>
      <p className="muted">
        Click two plots to swap their treatment assignments (ARM-style hot edit).
        {selected !== null && ' Select a second plot to complete the swap.'}
      </p>
      <div
        className="trialmap"
        style={{ gridTemplateColumns: `repeat(${trial.plotCols}, minmax(90px, 1fr))` }}
      >
        {grid.flatMap((rowArr, r) =>
          rowArr.map((p, c) =>
            p ? (
              <div
                key={p.id}
                className={`plot-cell ${selected === p.id ? 'selected' : ''}`}
                onClick={() => onCellClick(p.id!)}
              >
                <div className="pnum">Plot {p.plotNumber}</div>
                <div className="trt">{treatmentName(p.treatmentId)}</div>
                <div className="muted" style={{ fontSize: 11 }}>
                  Rep {p.rep}
                </div>
              </div>
            ) : (
              <div key={`${r}-${c}`} className="plot-cell" style={{ opacity: 0.3 }} />
            )
          )
        )}
      </div>
    </div>
  )
}
