/**
 * B6 (first cut) — import a historic trial from a spreadsheet so real data can be committed to the
 * database. This is a standalone script, NOT the full import feature (the column-mapping UI is the
 * later Phase-5 build). It reconstructs a trial that already has a layout — it does NOT randomize.
 *
 * Expected CSV (export your sheet to CSV first — one row per plot):
 *
 *   plot,rep,block,treatment,<measurement 1>,<measurement 2>,...
 *   1,1,1,Untreated,12.4,88
 *   2,1,1,Product A,9.1,72
 *   ...
 *
 * Columns (header row required, case-insensitive):
 *   - plot / plotnumber   (required) the plot number
 *   - rep / replicate     (required) the replicate number
 *   - block               (optional) incomplete/complete block; defaults to rep
 *   - treatment / trt     (required) treatment label or number; distinct values become treatments
 *   - name                (optional) a display name for the treatment
 *   - everything else      is treated as a measurement column (numeric; blanks are left empty)
 *
 * Usage:
 *   POSTGRES_URL=... npx tsx scripts/import-historic-trial.ts <file.csv> [--title "..."] \
 *     [--site "..."] [--crop "..."] [--design RCB|CRD|ALPHA] [--dry-run]
 *
 * --dry-run prints exactly what would be inserted without touching the database.
 */

import { readFileSync } from 'node:fs'
import { getDb } from '../src/lib/db'
import {
  protocol,
  treatment,
  trial,
  plot,
  measurementHeader,
  measurementValue,
} from '../src/lib/db/schema'

// --- tiny RFC4180-ish CSV parser (handles quoted fields, commas and quotes inside quotes) --------
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((v) => v.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((v) => v.trim() !== '')) rows.push(row)
  }
  return rows
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 ? process.argv[i + 1] : undefined
}

const RESERVED = new Set([
  'plot',
  'plotnumber',
  'rep',
  'replicate',
  'block',
  'treatment',
  'trt',
  'name',
  'row',
  'col',
  'maprow',
  'mapcol',
])

async function main() {
  const file = process.argv[2]
  if (!file || file.startsWith('--')) {
    console.error('Usage: npx tsx scripts/import-historic-trial.ts <file.csv> [--title ..] [--dry-run]')
    process.exit(1)
  }
  const dryRun = process.argv.includes('--dry-run')
  const design = (arg('design') ?? 'RCB').toUpperCase()
  if (!['RCB', 'CRD', 'ALPHA'].includes(design)) {
    console.error(`Invalid --design "${design}" (use RCB, CRD, or ALPHA)`)
    process.exit(1)
  }

  const rows = parseCsv(readFileSync(file, 'utf8'))
  if (rows.length < 2) {
    console.error('CSV needs a header row and at least one data row.')
    process.exit(1)
  }

  const header = rows[0].map((h) => h.trim())
  const lower = header.map((h) => h.toLowerCase())
  const colIdx = (names: string[]) => lower.findIndex((h) => names.includes(h))
  const iPlot = colIdx(['plot', 'plotnumber'])
  const iRep = colIdx(['rep', 'replicate'])
  const iBlock = colIdx(['block'])
  const iTrt = colIdx(['treatment', 'trt'])
  const iName = colIdx(['name'])
  if (iPlot === -1 || iRep === -1 || iTrt === -1) {
    console.error('CSV must have plot, rep, and treatment columns.')
    process.exit(1)
  }
  const measurementCols = header
    .map((h, i) => ({ h, i }))
    .filter(({ h, i }) => i !== -1 && !RESERVED.has(h.toLowerCase()) && h.trim() !== '')

  // --- parse rows -------------------------------------------------------------------------------
  interface Row {
    plotNumber: number
    rep: number
    block: number
    trtLabel: string
    trtName: string
    values: Map<number, number> // measurement col index -> value
  }
  const parsed: Row[] = []
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]
    const plotNumber = Number(cells[iPlot])
    const rep = Number(cells[iRep])
    const trtLabel = (cells[iTrt] ?? '').trim()
    if (!Number.isFinite(plotNumber) || !Number.isFinite(rep) || !trtLabel) {
      console.error(`Skipping row ${r + 1}: missing plot/rep/treatment.`)
      continue
    }
    const block = iBlock !== -1 && cells[iBlock]?.trim() ? Number(cells[iBlock]) : rep
    const values = new Map<number, number>()
    for (const { i } of measurementCols) {
      const raw = (cells[i] ?? '').trim()
      if (raw === '') continue
      const v = Number(raw)
      if (Number.isFinite(v)) values.set(i, v)
    }
    parsed.push({
      plotNumber,
      rep,
      block,
      trtLabel,
      trtName: iName !== -1 ? (cells[iName] ?? '').trim() : '',
      values,
    })
  }

  // --- derive treatments (distinct, numbered by first appearance; keep numeric labels as-is) -----
  const trtOrder: string[] = []
  for (const row of parsed) if (!trtOrder.includes(row.trtLabel)) trtOrder.push(row.trtLabel)
  const allNumeric = trtOrder.every((t) => Number.isInteger(Number(t)))
  const trtNumberFor = new Map<string, number>()
  trtOrder.forEach((t, i) => trtNumberFor.set(t, allNumeric ? Number(t) : i + 1))

  const reps = [...new Set(parsed.map((p) => p.rep))]
  const cols = trtOrder.length || 1
  const title = arg('title') ?? file.replace(/^.*\//, '').replace(/\.csv$/i, '')
  const site = arg('site') ?? title
  const crop = arg('crop') ?? ''

  console.log(`\nImport plan for "${title}":`)
  console.log(`  design:       ${design}`)
  console.log(`  treatments:   ${trtOrder.length}  (${trtOrder.join(', ')})`)
  console.log(`  replicates:   ${reps.length}`)
  console.log(`  plots:        ${parsed.length}`)
  console.log(`  measurements: ${measurementCols.length}  (${measurementCols.map((m) => m.h).join(', ')})`)
  const valueCount = parsed.reduce((s, p) => s + p.values.size, 0)
  console.log(`  values:       ${valueCount}\n`)

  if (dryRun) {
    console.log('--dry-run: nothing written.')
    return
  }
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL is not set — set it (or use --dry-run).')
    process.exit(1)
  }

  const db = getDb()
  await db.transaction(async (tx) => {
    const [proto] = await tx
      .insert(protocol)
      .values({ title, crop, design, replicates: reps.length })
      .returning()

    const insertedTrts = await tx
      .insert(treatment)
      .values(
        trtOrder.map((label) => ({
          protocolId: proto.id,
          number: trtNumberFor.get(label)!,
          name: parsed.find((p) => p.trtLabel === label)?.trtName || (allNumeric ? `Treatment ${label}` : label),
        }))
      )
      .returning()
    const trtIdByNumber = new Map(insertedTrts.map((t) => [t.number, t.id]))

    const plotRows = Math.ceil(parsed.length / cols)
    const [tr] = await tx
      .insert(trial)
      .values({ protocolId: proto.id, plotRows, plotCols: cols, seed: 0, siteName: site })
      .returning()

    const ordered = [...parsed].sort((a, b) => a.plotNumber - b.plotNumber)
    const insertedPlots = await tx
      .insert(plot)
      .values(
        ordered.map((p, idx) => ({
          trialId: tr.id,
          plotNumber: p.plotNumber,
          rep: p.rep,
          block: design === 'CRD' ? 0 : p.block,
          treatmentId: trtIdByNumber.get(trtNumberFor.get(p.trtLabel)!)!,
          mapRow: Math.floor(idx / cols),
          mapCol: idx % cols,
        }))
      )
      .returning()
    const plotIdByNumber = new Map(insertedPlots.map((p) => [p.plotNumber, p.id]))

    const insertedHeaders = await tx
      .insert(measurementHeader)
      .values(
        measurementCols.map((m, ordinal) => ({
          trialId: tr.id,
          measurementType: m.h,
          ordinal,
          origin: 'site' as const,
        }))
      )
      .returning()
    const headerIdByCol = new Map(measurementCols.map((m, i) => [m.i, insertedHeaders[i].id]))

    const valueRows: { measurementHeaderId: number; plotId: number; subsample: number; value: number }[] = []
    for (const p of parsed) {
      const plotId = plotIdByNumber.get(p.plotNumber)!
      for (const [colIndex, value] of p.values) {
        valueRows.push({ measurementHeaderId: headerIdByCol.get(colIndex)!, plotId, subsample: 1, value })
      }
    }
    if (valueRows.length > 0) await tx.insert(measurementValue).values(valueRows)

    console.log(`Imported trial #${tr.id} (protocol #${proto.id}). Open /trial/${tr.id} to view.`)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
