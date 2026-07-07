import { useMemo, useState, useRef, useEffect } from 'react'
import { DataSheetGrid, keyColumn, floatColumn, textColumn } from 'react-datasheet-grid'
import type { DataSheetGridRef } from 'react-datasheet-grid'
import 'react-datasheet-grid/dist/style.css'
import { useStore } from '../../store'
import type { AssessmentHeader, AssessmentValue } from '@shared/types'

// Index-signature shape (not an interface with required fields) so it stays structurally
// compatible with react-datasheet-grid's generic column helpers.
type GridRow = {
  rowKey?: string
  kind?: 'base' | 'sub'
  plotId?: number
  sub?: number
  [key: string]: number | string | null | undefined
}

export function DataEntryView(): JSX.Element {
  const { snapshot, setSnapshot, run } = useStore()
  const headers = snapshot!.assessmentHeaders
  const treatmentName = useMemo(() => {
    const m = new Map(snapshot!.treatments.map((t) => [t.id!, t]))
    return (id: number): string => {
      const t = m.get(id)
      return t ? `${t.number}. ${t.name || 'Trt ' + t.number}` : `#${id}`
    }
  }, [snapshot])

  const title = (h: AssessmentHeader): string =>
    h.description || h.ratingType || `Assessment ${h.ordinal + 1}`
  const subCount = (h: AssessmentHeader): number => Math.max(1, h.subsamples ?? 1)

  // value lookup: `${headerId}:${plotId}:${subsample}` -> value
  const valueMap = useMemo(() => {
    const m = new Map<string, number | null>()
    for (const v of snapshot!.assessmentValues)
      m.set(`${v.assessmentHeaderId}:${v.plotId}:${v.subsample ?? 1}`, v.value)
    return m
  }, [snapshot])

  const meanFor = (h: AssessmentHeader, plotId: number): number | null => {
    const vals: number[] = []
    for (let s = 1; s <= subCount(h); s++) {
      const v = valueMap.get(`${h.id}:${plotId}:${s}`)
      if (v !== null && v !== undefined) vals.push(v)
    }
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  const maxSub = useMemo(() => Math.max(1, ...headers.map(subCount)), [headers])

  // Global expand/collapse: collapsed shows one row per plot (means, no Subsample column); expanded
  // shows every plot's subsample rows only (no base/mean row) with the Subsample column visible.
  const [expanded, setExpanded] = useState(false)
  const gridRef = useRef<DataSheetGridRef>(null)
  const lastPos = useRef<{ col: number; row: number } | null>(null)
  const lastActive = useRef<{ colId: string; plotId: number } | null>(null)

  const rows: GridRow[] = useMemo(() => {
    const out: GridRow[] = []
    for (const p of snapshot!.plots) {
      if (!expanded) {
        // Collapsed: one base row per plot. Multi-subsample cells show the read-only mean.
        const base: GridRow = {
          rowKey: `p${p.id}`,
          kind: 'base',
          plotId: p.id!,
          sub: 0,
          plot: p.plotNumber,
          rep: p.rep,
          treatment: treatmentName(p.treatmentId)
        }
        for (const h of headers) {
          base[`h_${h.id}`] =
            subCount(h) === 1 ? valueMap.get(`${h.id}:${p.id}:1`) ?? null : meanFor(h, p.id!)
        }
        out.push(base)
      } else {
        // Expanded: only subsample rows; plot/rep/treatment on the first row of each plot.
        for (let s = 1; s <= maxSub; s++) {
          const row: GridRow = {
            rowKey: `p${p.id}s${s}`,
            kind: 'sub',
            plotId: p.id!,
            sub: s,
            subLabel: String(s),
            plot: s === 1 ? p.plotNumber : '',
            rep: s === 1 ? p.rep : '',
            treatment: s === 1 ? treatmentName(p.treatmentId) : ''
          }
          for (const h of headers) {
            row[`h_${h.id}`] = s <= subCount(h) ? valueMap.get(`${h.id}:${p.id}:${s}`) ?? null : null
          }
          out.push(row)
        }
      }
    }
    return out
  }, [snapshot, headers, valueMap, treatmentName, maxSub, expanded])

  const columns = useMemo(() => {
    return [
      { ...keyColumn('plot', textColumn), title: 'Plot', disabled: true, width: 0.5 },
      { ...keyColumn('rep', textColumn), title: 'Rep', disabled: true, width: 0.4 },
      { ...keyColumn('treatment', textColumn), title: 'Treatment', disabled: true, width: 1.4 },
      // Subsample column: static (always present when any assessment has subsamples). This grid only
      // lays out the columns present at mount, so the column stays put; it's simply blank on the
      // collapsed plot rows and shows the subsample index once rows are expanded.
      ...(maxSub > 1
        ? [{ ...keyColumn('subLabel', textColumn), title: 'Subsample', disabled: true, width: 0.6 }]
        : []),
      ...headers.map((h) => ({
        ...keyColumn(`h_${h.id}`, floatColumn),
        title: title(h),
        // Base row: multi-subsample cell is the read-only mean. Sub row: greyed past its count.
        disabled: ({ rowData }: { rowData: GridRow }): boolean =>
          rowData.kind === 'base' ? subCount(h) > 1 : (rowData.sub as number) > subCount(h)
      }))
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers, maxSub])

  const onChange = (next: GridRow[]): void => {
    // Persist only changed cells to keep writes minimal.
    const changes: AssessmentValue[] = []
    next.forEach((row, i) => {
      const before = rows[i]
      const plotId = before.plotId as number
      for (const h of headers) {
        const key = `h_${h.id}`
        if (before[key] === row[key]) continue
        let subsample: number
        if (before.kind === 'base') {
          if (subCount(h) > 1) continue // mean cell is read-only
          subsample = 1
        } else {
          const s = before.sub as number
          if (s > subCount(h)) continue
          subsample = s
        }
        const after = row[key]
        changes.push({
          assessmentHeaderId: h.id!,
          plotId,
          subsample,
          value: after === null || after === '' ? null : Number(after)
        })
      }
    })
    if (changes.length === 0) return
    run('Saving data', async () => {
      for (const c of changes) await window.art.assessments.setValue(c)
      // Reflect changes locally without a full round-trip.
      const map = new Map(
        snapshot!.assessmentValues.map((v) => [
          `${v.assessmentHeaderId}:${v.plotId}:${v.subsample ?? 1}`,
          v
        ])
      )
      for (const c of changes) {
        const k = `${c.assessmentHeaderId}:${c.plotId}:${c.subsample}`
        if (c.value === null) map.delete(k)
        else map.set(k, c)
      }
      setSnapshot({ ...snapshot!, assessmentValues: [...map.values()] })
    })
  }

  // Expansion is driven by the focused column: a multi-subsample assessment (or the Subsample
  // column itself) expands all plots; anything else collapses. Adding/removing the Subsample
  // column shifts column indices and makes the grid re-emit onActiveCellChange with the SAME
  // numeric (col,row) but a new colId — we dedupe on (col,row) to ignore those spurious re-emits.
  const onActiveCellChange = ({
    cell
  }: {
    cell: { colId?: string; col: number; row: number } | null
  }): void => {
    if (!cell) return
    const prev = lastPos.current
    if (prev && prev.col === cell.col && prev.row === cell.row) return // columns re-indexed, not a move
    lastPos.current = { col: cell.col, row: cell.row }
    const colId = cell.colId
    const r = rows[cell.row]
    if (r && colId) lastActive.current = { colId, plotId: r.plotId as number }
    const h = colId?.startsWith('h_') ? headers.find((x) => `h_${x.id}` === colId) : undefined
    setExpanded(colId === 'subLabel' || !!(h && subCount(h) > 1))
  }

  // After expand/collapse, rows + columns shift — move focus to a sensible cell in the new layout.
  useEffect(() => {
    const la = lastActive.current
    if (!la || !gridRef.current) return
    const idx = expanded
      ? rows.findIndex((r) => r.plotId === la.plotId && r.kind === 'sub' && r.sub === 1)
      : rows.findIndex((r) => r.plotId === la.plotId && r.kind === 'base')
    if (idx >= 0) gridRef.current.setActiveCell({ col: la.colId || 0, row: idx })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  return (
    <div className="card">
      <h2>Data Entry</h2>
      {headers.length === 0 ? (
        <p className="muted">Add an assessment column on the Assessments tab to begin entering data.</p>
      ) : (
        <>
          <p className="muted">
            One row per plot. For assessments with subsamples the cell shows the plot mean
            (read-only); select that cell to expand every plot into its subsample rows for entry.
            The mean is the value used in analysis.
          </p>
          <DataSheetGrid<GridRow>
            ref={gridRef}
            value={rows}
            columns={columns}
            onChange={onChange}
            onActiveCellChange={onActiveCellChange}
            rowKey={({ rowData }): string => rowData.rowKey ?? ''}
            lockRows
            height={460}
          />
        </>
      )}
    </div>
  )
}
