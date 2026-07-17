'use client'

import { useMemo } from 'react'
import type { ProjectSnapshot, Plot, Trial } from '@shared/types'

export type ColourBy = 'none' | 'treatment' | 'rep' | 'block'

interface PlotGridProps {
  snapshot: ProjectSnapshot
  colourBy?: ColourBy
  /** Show the colour legend beneath the grid (only meaningful when colourBy !== 'none'). */
  legend?: boolean
  /** Square cell size in px. Smaller values fit larger trials on a page. */
  cell?: number
}

/**
 * Categorical fill colours for the trial map (colour-by treatment / rep / block). The first eight
 * hues are spaced for colour-blind separation; beyond eight, hues are golden-angle spaced. Cells
 * always show a text label too, so colour is a secondary encoding, not the sole identifier.
 */
const BASE_HUES = [212, 158, 40, 120, 249, 1, 338, 16]
function categoryColor(index: number): string {
  const hue = index < BASE_HUES.length ? BASE_HUES[index] : Math.round((index * 137.508) % 360)
  return `hsl(${hue} 62% 86%)`
}

/**
 * A read-only, print-friendly rendering of the physical plot layout (mapRow/mapCol), reused by the
 * printable Field Map and embedded in the Trial Summary document. Rows render bottom-up (mapRow 0 at
 * the bottom) to match the interactive trial map.
 */
export function PlotGrid({ snapshot, colourBy = 'none', legend = true, cell = 52 }: PlotGridProps) {
  const trial = snapshot.trial as Trial
  const protocol = snapshot.protocol
  const plots = snapshot.plots
  const isAlpha = protocol.design === 'ALPHA'

  const treatment = useMemo(() => new Map(snapshot.treatments.map((t) => [t.id!, t])), [snapshot.treatments])
  const trtNum = (id: number): number => treatment.get(id)?.number ?? 0

  const colour = useMemo(() => {
    if (colourBy === 'none')
      return { of: (): string | undefined => undefined, legend: [] as { label: string; color: string }[] }
    if (colourBy === 'treatment') {
      const ts = [...snapshot.treatments].sort((a, b) => a.number - b.number)
      const idx = new Map(ts.map((t, i) => [t.id!, i]))
      return {
        of: (p: Plot): string => categoryColor(idx.get(p.treatmentId) ?? 0),
        legend: ts.map((t, i) => ({
          label: `${t.number}. ${t.name || 'Trt ' + t.number}`,
          color: categoryColor(i)
        }))
      }
    }
    const key = (p: Plot): number => (colourBy === 'rep' ? p.rep : p.block)
    const vals = [...new Set(plots.map(key))].sort((a, b) => a - b)
    const idx = new Map(vals.map((v, i) => [v, i]))
    const name = colourBy === 'rep' ? 'Rep' : 'Block'
    return {
      of: (p: Plot): string => categoryColor(idx.get(key(p)) ?? 0),
      legend: vals.map((v, i) => ({ label: `${name} ${v}`, color: categoryColor(i) }))
    }
  }, [colourBy, snapshot.treatments, plots])

  const grid: (Plot | null)[][] = Array.from({ length: trial.plotRows }, () => new Array(trial.plotCols).fill(null))
  for (const p of plots) if (grid[p.mapRow]) grid[p.mapRow][p.mapCol] = p

  const rowsTopToBottom = Array.from({ length: trial.plotRows }, (_, i) => trial.plotRows - 1 - i)
  const nodes: React.ReactNode[] = [<div key="corner" className="tm-corner" />]
  for (let c = 0; c < trial.plotCols; c++)
    nodes.push(
      <div key={`ch${c}`} className="tm-colhead">
        {c + 1}
      </div>
    )
  for (const r of rowsTopToBottom) {
    nodes.push(
      <div key={`rh${r}`} className="tm-rowhead">
        {r + 1}
      </div>
    )
    for (let c = 0; c < trial.plotCols; c++) {
      const p = grid[r][c]
      if (!p) {
        nodes.push(<div key={`e${r}-${c}`} className="plot-cell empty" />)
        continue
      }
      const bR = isAlpha && grid[r][c + 1] && grid[r][c + 1]!.block !== p.block
      const bB = isAlpha && grid[r - 1]?.[c] && grid[r - 1][c]!.block !== p.block
      nodes.push(
        <div
          key={p.id}
          className={`plot-cell${p.excluded ? ' excluded' : ''}`}
          style={{
            background: p.excluded ? undefined : colour.of(p),
            ...(bR ? { borderRight: '2px solid var(--text)' } : {}),
            ...(bB ? { borderBottom: '2px solid var(--text)' } : {})
          }}
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
    <div className="trialmap-layout">
      <div className="trialmap-wrap">
        <div className="trialmap" style={{ gridTemplateColumns: `26px repeat(${trial.plotCols}, ${cell}px)` }}>
          {nodes}
        </div>
      </div>
      {legend && colour.legend.length > 0 && (
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
  )
}
