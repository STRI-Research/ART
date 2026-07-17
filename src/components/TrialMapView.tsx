'use client'

import { useState, useMemo, type ReactElement } from 'react'
import { api, type TrialSnapshot } from '@/lib/api'
import { canSwapTreatments, defaultCols } from '@shared/design'
import { categoryColor } from '@/lib/colors'
import type { Plot } from '@shared/types'

const CELL = 56 // square cell size (px)

type Props = {
  trialId: number
  snapshot: TrialSnapshot
  onSnapshotChange: (snapshot: TrialSnapshot) => void
}

export function TrialMapView({ trialId, snapshot, onSnapshotChange }: Props) {
  const trial = snapshot.trial
  const protocol = snapshot.protocol
  const plots = snapshot.plots
  const locked = !!trial.layoutLockedAt
  const hasLayout = plots.length > 0
  const isAlpha = protocol.design === 'ALPHA'

  const [selected, setSelected] = useState<number | null>(null)
  const [excluding, setExcluding] = useState<{ plotId: number; plotNumber: number } | null>(null)
  const [reason, setReason] = useState('')
  const [confirmingLock, setConfirmingLock] = useState(false)
  const [mode, setMode] = useState<'rearrange' | 'swap'>('rearrange')
  const [colourBy, setColourBy] = useState<'none' | 'treatment' | 'rep' | 'block'>('none')
  const [dragId, setDragId] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<TrialSnapshot>) => {
    setBusy(true)
    setError(null)
    try {
      onSnapshotChange(await fn())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const treatment = useMemo(() => new Map(snapshot.treatments.map((t) => [t.id!, t])), [snapshot])
  const trtNum = (id: number): number => treatment.get(id)?.number ?? 0
  const plotTitle = (p: Plot): string => {
    const t = treatment.get(p.treatmentId)
    const name = t ? `${t.number}. ${t.name || 'Trt ' + t.number}` : `#${p.treatmentId}`
    return `Plot ${p.plotNumber} · Rep ${p.rep}${isAlpha ? ` · Blk ${p.block}` : ''} · ${name}${
      p.excluded ? ` · EXCLUDED: ${p.excludeReason}` : ''
    }`
  }

  // Colour-by mapping + legend (categorical, colour is a secondary aid to the labels).
  const colour = useMemo(() => {
    if (colourBy === 'none')
      return { of: (): string | undefined => undefined, legend: [] as { label: string; color: string }[] }
    if (colourBy === 'treatment') {
      const ts = [...snapshot.treatments].sort((a, b) => a.number - b.number)
      const idx = new Map(ts.map((t, i) => [t.id!, i]))
      return {
        of: (p: Plot): string => categoryColor(idx.get(p.treatmentId) ?? 0),
        legend: ts.map((t, i) => ({ label: `${t.number}. ${t.name || 'Trt ' + t.number}`, color: categoryColor(i) })),
      }
    }
    const key = (p: Plot): number => (colourBy === 'rep' ? p.rep : p.block)
    const vals = [...new Set(plots.map(key))].sort((a, b) => a - b)
    const idx = new Map(vals.map((v, i) => [v, i]))
    const name = colourBy === 'rep' ? 'Rep' : 'Block'
    return {
      of: (p: Plot): string => categoryColor(idx.get(key(p)) ?? 0),
      legend: vals.map((v, i) => ({ label: `${name} ${v}`, color: categoryColor(i) })),
    }
  }, [colourBy, snapshot, plots])

  // Before a layout exists, the Trial Map is where you randomize — show only that.
  if (!hasLayout) {
    return (
      <>
        <div className="card">
          <h2 style={{ margin: 0 }}>Trial Map</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            Generate this site&apos;s randomized layout to lay out the plots, then confirm &amp; lock
            it to begin data entry.
          </p>
        </div>
        <RandomizationCard trialId={trialId} snapshot={snapshot} onSnapshotChange={onSnapshotChange} />
      </>
    )
  }

  // Physical grid (mapRow/mapCol).
  const grid: (Plot | null)[][] = Array.from({ length: trial.plotRows }, () =>
    new Array(trial.plotCols).fill(null)
  )
  for (const p of plots) if (grid[p.mapRow]) grid[p.mapRow][p.mapCol] = p

  const selectedPlot = selected != null ? plots.find((p) => p.id === selected) ?? null : null
  const canTarget = (p: Plot): boolean =>
    !selectedPlot || selectedPlot.id === p.id || canSwapTreatments(protocol.design, selectedPlot, p)
  const eligibleCount = selectedPlot
    ? plots.filter((p) => p.id !== selectedPlot.id && canSwapTreatments(protocol.design, selectedPlot, p)).length
    : 0

  const onCellClick = (p: Plot): void => {
    if (locked) {
      if (p.excluded) {
        run(() => api.trials.setPlotExcluded(trialId, p.id!, false, ''))
      } else {
        setReason('')
        setExcluding({ plotId: p.id!, plotNumber: p.plotNumber })
      }
      return
    }
    if (mode !== 'swap') return // rearrange uses drag
    if (selected === null) return setSelected(p.id!)
    if (selected === p.id) return setSelected(null)
    if (!canTarget(p)) {
      setError('Treatments can only be swapped within the same block/rep — that would change the design.')
      return
    }
    const a = selected
    setSelected(null)
    run(() => api.trials.swapPlots(trialId, a, p.id!))
  }

  const onDrop = (row: number, col: number): void => {
    const id = dragId
    setDragId(null)
    setDragOver(null)
    if (id == null || locked || mode !== 'rearrange') return
    run(() => api.trials.movePlot(trialId, id, row, col))
  }

  const reshape = (cols: number): void => {
    if (cols < 1 || cols > plots.length) return
    run(() => api.trials.reshapeLayout(trialId, cols))
  }

  const doLock = (): void => {
    setConfirmingLock(false)
    run(() => api.trials.lock(trialId))
  }
  const confirmExclude = (): void => {
    if (!excluding || !reason.trim()) return
    const { plotId } = excluding
    setExcluding(null)
    run(() => api.trials.setPlotExcluded(trialId, plotId, true, reason.trim()))
  }

  const excludedCount = plots.filter((p) => p.excluded).length

  // Build the grid cells (bottom-up: mapRow 0 renders at the bottom), with edge headers.
  const rowsTopToBottom = Array.from({ length: trial.plotRows }, (_, i) => trial.plotRows - 1 - i)
  const nodes: ReactElement[] = [<div key="corner" className="tm-corner" />]
  for (let c = 0; c < trial.plotCols; c++) nodes.push(<div key={`ch${c}`} className="tm-colhead">{c + 1}</div>)
  for (const r of rowsTopToBottom) {
    nodes.push(<div key={`rh${r}`} className="tm-rowhead">{r + 1}</div>)
    for (let c = 0; c < trial.plotCols; c++) {
      const p = grid[r][c]
      if (!p) {
        nodes.push(
          <div
            key={`e${r}-${c}`}
            className={`plot-cell empty${dragOver === `${r}-${c}` ? ' dragover' : ''}`}
            onDragOver={(e) => {
              if (!locked && mode === 'rearrange') {
                e.preventDefault()
                setDragOver(`${r}-${c}`)
              }
            }}
            onDrop={() => onDrop(r, c)}
          />
        )
        continue
      }
      // ALPHA block boundaries: heavier edge where a neighbour's block differs.
      const bR = isAlpha && grid[r][c + 1] && grid[r][c + 1]!.block !== p.block
      const bB = isAlpha && grid[r - 1]?.[c] && grid[r - 1][c]!.block !== p.block
      const swapping = mode === 'swap' && selected != null && p.id !== selected
      const eligible = swapping && canTarget(p)
      const dim = swapping && !canTarget(p)
      nodes.push(
        <div
          key={p.id}
          className={
            `plot-cell${selected === p.id ? ' selected' : ''}${p.excluded ? ' excluded' : ''}` +
            `${dragOver === `${r}-${c}` ? ' dragover' : ''}${dim ? ' dim' : ''}${eligible ? ' eligible' : ''}`
          }
          style={{
            background: p.excluded ? undefined : colour.of(p),
            ...(bR ? { borderRight: '2px solid var(--text)' } : {}),
            ...(bB ? { borderBottom: '2px solid var(--text)' } : {}),
          }}
          draggable={!locked && mode === 'rearrange'}
          title={plotTitle(p)}
          onClick={() => onCellClick(p)}
          onDragStart={() => setDragId(p.id!)}
          onDragOver={(e) => {
            if (!locked && mode === 'rearrange') {
              e.preventDefault()
              setDragOver(`${r}-${c}`)
            }
          }}
          onDrop={() => onDrop(r, c)}
        >
          <div className="pnum">
            {p.plotNumber}
            {p.excluded && <span className="excluded-tag">excl</span>}
          </div>
          <div className="trt">T{trtNum(p.treatmentId)}</div>
          <div className="muted" style={{ fontSize: 10 }}>
            R{p.rep}
            {isAlpha && ` · B${p.block}`}
          </div>
        </div>
      )
    }
  }

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 style={{ margin: 0 }}>
            Trial Map — {protocol.design}, {protocol.replicates} reps
            {isAlpha && `, block size ${protocol.blockSize}`}, {plots.length} plots
          </h2>
          {locked ? (
            <span className="lock-badge">🔒 Locked {new Date(trial.layoutLockedAt).toLocaleString()}</span>
          ) : (
            <button className="primary" disabled={busy} onClick={() => setConfirmingLock(true)}>
              Confirm &amp; lock layout
            </button>
          )}
        </div>

        {error && (
          <div className="banner" style={{ background: '#fbeaea', borderColor: '#e3b5af', color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        {/* Controls */}
        <div className="row" style={{ margin: '4px 0 12px', gap: 16 }}>
          {!locked && (
            <>
              <div className="segmented">
                <button
                  className={mode === 'rearrange' ? 'active' : ''}
                  onClick={() => {
                    setMode('rearrange')
                    setSelected(null)
                  }}
                >
                  Rearrange
                </button>
                <button className={mode === 'swap' ? 'active' : ''} onClick={() => setMode('swap')}>
                  Swap treatments
                </button>
              </div>
              <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                <label style={{ margin: 0 }}>Columns</label>
                <input
                  type="number"
                  style={{ width: 64 }}
                  min={1}
                  max={plots.length}
                  value={trial.plotCols}
                  onChange={(e) => reshape(Number(e.target.value))}
                />
                <button
                  onClick={() => reshape(defaultCols(protocol.design, protocol.blockSize, snapshot.treatments.length))}
                >
                  Reset layout
                </button>
              </div>
            </>
          )}
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <label style={{ margin: 0 }}>Colour by</label>
            <select value={colourBy} onChange={(e) => setColourBy(e.target.value as typeof colourBy)}>
              <option value="none">None</option>
              <option value="treatment">Treatment</option>
              <option value="rep">Rep</option>
              {isAlpha && <option value="block">Block</option>}
            </select>
          </div>
        </div>

        {locked ? (
          <p className="muted">
            Layout locked — the randomization is final. Click a plot to exclude it from analysis (or
            restore it); excluded plots keep their data but are omitted from statistics.
            {excludedCount > 0 && ` ${excludedCount} excluded.`}
          </p>
        ) : (
          <div className="banner">
            {mode === 'rearrange' ? (
              <>
                <strong>Rearrange:</strong> drag a plot to move it (drop on another to swap positions),
                or set <strong>Columns</strong> to reshape the field. Physical layout only — it doesn&apos;t
                change the randomization or analysis.
              </>
            ) : (
              <>
                <strong>Swap treatments:</strong>{' '}
                {selected === null ? (
                  <>
                    click a plot to start. Only plots in the same {isAlpha ? 'block' : 'rep'} can be
                    swapped (so the analysis stays valid).
                  </>
                ) : (
                  <>
                    now click one of the <strong>{eligibleCount}</strong> highlighted plots (same{' '}
                    {isAlpha ? 'block' : 'rep'}) to swap, or click the selected plot again to cancel.
                  </>
                )}
              </>
            )}{' '}
            Then <strong>Confirm &amp; lock</strong> to enable data entry.
          </div>
        )}

        <div className="trialmap-layout">
          <div className="trialmap-wrap">
            <div
              className="trialmap"
              style={{ gridTemplateColumns: `26px repeat(${trial.plotCols}, ${CELL}px)` }}
            >
              {nodes}
            </div>
          </div>
          {colour.legend.length > 0 && (
            <div className="tm-legend">
              {colour.legend.map((l) => (
                <span key={l.label} className="tm-legend-item">
                  <span className="tm-swatch" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {excluding && (
          <div className="modal-overlay" onClick={() => setExcluding(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>Exclude plot #{excluding.plotNumber} from analysis</h3>
              <p className="muted">
                The plot&apos;s data is kept on record but omitted from all statistics. A reason is
                recorded in the audit trail.
              </p>
              <label>Reason</label>
              <textarea
                rows={3}
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. treatment mis-applied in the field"
              />
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={() => setExcluding(null)}>Cancel</button>
                <button className="primary danger" disabled={!reason.trim()} onClick={confirmExclude}>
                  Exclude plot
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmingLock && (
          <div className="modal-overlay" onClick={() => setConfirmingLock(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>Confirm &amp; lock this layout?</h3>
              <p className="muted">
                This finalizes the randomization and enables data entry. The layout cannot be changed
                afterward — plots can only be excluded from analysis.
              </p>
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={() => setConfirmingLock(false)}>Cancel</button>
                <button className="primary" onClick={doLock}>
                  Lock layout
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {!locked && <RandomizationCard trialId={trialId} snapshot={snapshot} onSnapshotChange={onSnapshotChange} />}
    </>
  )
}

/** Seed + Generate/Regenerate control. Regenerating replaces the layout and clears entered data. */
function RandomizationCard({ trialId, snapshot, onSnapshotChange }: Props) {
  const trial = snapshot.trial
  const protocol = snapshot.protocol
  const plots = snapshot.plots
  const locked = !!trial.layoutLockedAt
  const hasLayout = plots.length > 0
  const treatmentCount = snapshot.treatments.length
  const canGenerate = treatmentCount >= 2
  const [seedText, setSeedText] = useState(trial.seed ? String(trial.seed) : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const generate = async () => {
    // Blank or non-integer text = random seed; never forward NaN.
    const parsed = Number(seedText)
    const seed = seedText.trim() === '' || !Number.isInteger(parsed) ? undefined : parsed
    setBusy(true)
    setError(null)
    try {
      onSnapshotChange(await api.trials.generate(trialId, seed))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h2>Randomization</h2>
      <p className="muted">
        Design is fixed by the protocol:{' '}
        <strong>
          {protocol.design}, {protocol.replicates} replicates
        </strong>{' '}
        (from protocol — locked). This site generates its own randomized layout.
      </p>
      {hasLayout && !locked && (
        <div className="banner">
          A layout already exists for this site (seed {trial.seed}). Regenerating replaces it and
          clears any entered data.
        </div>
      )}
      {error && (
        <div className="banner" style={{ background: '#fbeaea', borderColor: '#e3b5af', color: 'var(--danger)' }}>
          {error}
        </div>
      )}
      <div className="row">
        <div style={{ width: 200 }}>
          <label>Seed (blank = random)</label>
          <input
            type="number"
            placeholder="random"
            value={seedText}
            disabled={locked}
            onChange={(e) => setSeedText(e.target.value)}
          />
        </div>
        <button className="primary" disabled={!canGenerate || locked || busy} onClick={generate}>
          {hasLayout ? 'Regenerate' : 'Generate'} layout ({treatmentCount * protocol.replicates} plots)
        </button>
      </div>
      {treatmentCount < 2 && <p className="muted">The protocol must define at least 2 treatments.</p>}
    </div>
  )
}
