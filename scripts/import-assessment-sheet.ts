/**
 * B6 (assessment-sheet cut) — import a historic trial from an STRI assessment-sheet workbook.
 *
 * Workbook shape (one trial per file):
 *   - one sheet per ASSESSMENT DATE, named "DD.MM.YY", each with:
 *       rows 1-6  metadata (Trial Name in D1, Date, Area, Assessor in B4, Notes, QC)
 *       row 7     column headers: Block! | Plot! | Treat1! | <measurement columns…>
 *       rows 8+   one row per plot: block, plot, treatment number, then measurement values
 *   - a "Trial Plan" sheet whose column A lists treatments as "[n] Name".
 *
 * Maps to ART as: one protocol (RCB) + treatments (Untreated → check) + one trial with the observed
 * plots, and ONE measurement header per (measurement × date) carrying that sheet's date + assessor,
 * so a measurement assessed across many dates becomes a time series. Values are imported as recorded
 * (including a pre-computed %CONT, if present — ART can also recompute % control from the check).
 *
 * Usage:
 *   POSTGRES_URL=... npx tsx scripts/import-assessment-sheet.ts <file.xlsx> [--title "..."] [--dry-run]
 */

import ExcelJS from 'exceljs'
import { getDb } from '../src/lib/db'
import {
  protocol,
  treatment,
  trial,
  plot,
  measurementHeader,
  measurementValue,
} from '../src/lib/db/schema'

type Cell = ExcelJS.Cell

function cellStr(cell: Cell): string {
  const v = cell.value as unknown
  if (v == null) return ''
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('result' in o) return String(o.result ?? '')
    if ('richText' in o) return (o.richText as { text: string }[]).map((t) => t.text).join('')
    if ('text' in o) return String(o.text)
  }
  return String(v)
}

function cellNum(cell: Cell): number | null {
  const v = cell.value as unknown
  const raw = v && typeof v === 'object' && 'result' in (v as object) ? (v as { result: unknown }).result : v
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** "03.07.25" -> "2025-07-03" (DD.MM.YY). Returns '' if it doesn't look like a date. */
function sheetDateToIso(name: string): string {
  const m = name.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (!m) return ''
  const [, d, mo, y] = m
  const yyyy = y.length === 2 ? `20${y}` : y
  return `${yyyy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 ? process.argv[i + 1] : undefined
}

interface HeaderSpec {
  type: string
  date: string
  assessor: string
  col: number
}

async function main() {
  const file = process.argv[2]
  if (!file || file.startsWith('--')) {
    console.error('Usage: npx tsx scripts/import-assessment-sheet.ts <file.xlsx> [--title ..] [--dry-run]')
    process.exit(1)
  }
  const dryRun = process.argv.includes('--dry-run')

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)

  // --- treatments from the Trial Plan sheet ("[n] Name") ----------------------------------------
  const planSheet = wb.worksheets.find((w) => /plan/i.test(w.name))
  const trtName = new Map<number, string>()
  if (planSheet) {
    planSheet.eachRow((row) => {
      const m = cellStr(row.getCell(1)).match(/^\[(\d+)\]\s*(.+)$/)
      if (m) trtName.set(Number(m[1]), m[2].trim())
    })
  }

  // --- data sheets: header row 7 begins "Block!" ------------------------------------------------
  const dataSheets = wb.worksheets.filter((w) => /^block/i.test(cellStr(w.getCell(7, 1))))
  if (dataSheets.length === 0) {
    console.error('No assessment-date sheets found (expected a "Block!/Plot!/Treat1!" header on row 7).')
    process.exit(1)
  }

  const first = dataSheets[0]
  const title = arg('title') ?? (cellStr(first.getCell('D1')) || file.replace(/^.*\//, '').replace(/\.[^.]+$/, ''))

  // Locate the key columns on the header row (row 7).
  const headerCells: { col: number; label: string }[] = []
  const row7 = first.getRow(7)
  row7.eachCell((cell, col) => headerCells.push({ col, label: cellStr(cell).replace(/!$/, '').trim() }))
  const findCol = (re: RegExp) => headerCells.find((h) => re.test(h.label))?.col
  const cBlock = findCol(/^block$/i)
  const cPlot = findCol(/^plot$/i)
  const cTreat = findCol(/^treat/i)
  if (!cBlock || !cPlot || !cTreat) {
    console.error('Could not find Block / Plot / Treat columns on row 7.')
    process.exit(1)
  }
  const isKeyCol = (col: number) => col === cBlock || col === cPlot || col === cTreat

  // --- plots from the first sheet ---------------------------------------------------------------
  interface P {
    plotNumber: number
    rep: number
    block: number
    treatmentNumber: number
  }
  const plots: P[] = []
  for (let r = 8; r <= first.rowCount; r++) {
    const pn = cellNum(first.getCell(r, cPlot))
    const bl = cellNum(first.getCell(r, cBlock))
    const tr = cellNum(first.getCell(r, cTreat))
    if (pn == null || tr == null) continue
    plots.push({ plotNumber: pn, rep: bl ?? 1, block: bl ?? 1, treatmentNumber: tr })
  }
  const treatmentNumbers = [...new Set(plots.map((p) => p.treatmentNumber))].sort((a, b) => a - b)
  const reps = [...new Set(plots.map((p) => p.rep))]

  // --- measurement headers: one per (date sheet × measurement column) ---------------------------
  const specs: HeaderSpec[] = []
  const valueBySpec: Map<number, { plotNumber: number; value: number }[]> = new Map()
  for (const ws of dataSheets) {
    const date = sheetDateToIso(ws.name)
    const assessor = cellStr(ws.getCell('B4'))
    const wsRow7 = ws.getRow(7)
    const measCols: { col: number; type: string }[] = []
    wsRow7.eachCell((cell, col) => {
      const label = cellStr(cell).replace(/!$/, '').trim()
      if (label && !isKeyCol(col)) measCols.push({ col, type: label })
    })
    for (const mc of measCols) {
      const specIndex = specs.length
      specs.push({ type: mc.type, date, assessor, col: mc.col })
      const vals: { plotNumber: number; value: number }[] = []
      for (let r = 8; r <= ws.rowCount; r++) {
        const pn = cellNum(ws.getCell(r, cPlot))
        if (pn == null) continue
        const v = cellNum(ws.getCell(r, mc.col))
        if (v != null) vals.push({ plotNumber: pn, value: v })
      }
      valueBySpec.set(specIndex, vals)
    }
  }
  const totalValues = [...valueBySpec.values()].reduce((s, a) => s + a.length, 0)
  const measurementTypes = [...new Set(specs.map((s) => s.type))]

  // --- report -----------------------------------------------------------------------------------
  console.log(`\nImport plan for "${title}":`)
  console.log(`  design:            RCB`)
  console.log(`  treatments:        ${treatmentNumbers.length}  (${treatmentNumbers.map((n) => `${n}:${trtName.get(n) ?? '?'}`).join(', ')})`)
  console.log(`  replicates/blocks: ${reps.length}`)
  console.log(`  plots:             ${plots.length}`)
  console.log(`  assessment dates:  ${dataSheets.length}  (${dataSheets[0].name} … ${dataSheets[dataSheets.length - 1].name})`)
  console.log(`  measurement types: ${measurementTypes.length}  (${measurementTypes.join(', ')})`)
  console.log(`  measurement cols:  ${specs.length}  (types × dates)`)
  console.log(`  values:            ${totalValues}\n`)

  const missingNames = treatmentNumbers.filter((n) => !trtName.has(n))
  if (missingNames.length) console.log(`  note: no Trial Plan name for treatment(s) ${missingNames.join(', ')} — will use "Treatment N".`)

  if (dryRun) {
    console.log('--dry-run: nothing written.')
    return
  }
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL is not set — set it (or use --dry-run).')
    process.exit(1)
  }

  // --- write (single transaction) ---------------------------------------------------------------
  const db = getDb()
  await db.transaction(async (tx) => {
    const [proto] = await tx
      .insert(protocol)
      .values({ title, design: 'RCB', replicates: reps.length })
      .returning()

    const insertedTrts = await tx
      .insert(treatment)
      .values(
        treatmentNumbers.map((n) => ({
          protocolId: proto.id,
          number: n,
          name: trtName.get(n) ?? `Treatment ${n}`,
          isCheck: /untreated|^utc$|control/i.test(trtName.get(n) ?? ''),
        }))
      )
      .returning()
    const trtIdByNumber = new Map(insertedTrts.map((t) => [t.number, t.id]))

    const cols = treatmentNumbers.length || 1
    const [tr] = await tx
      .insert(trial)
      .values({ protocolId: proto.id, plotRows: Math.ceil(plots.length / cols), plotCols: cols, seed: 0, siteName: title })
      .returning()

    const ordered = [...plots].sort((a, b) => a.plotNumber - b.plotNumber)
    const insertedPlots = await tx
      .insert(plot)
      .values(
        ordered.map((p, idx) => ({
          trialId: tr.id,
          plotNumber: p.plotNumber,
          rep: p.rep,
          block: p.block,
          treatmentId: trtIdByNumber.get(p.treatmentNumber)!,
          mapRow: Math.floor(idx / cols),
          mapCol: idx % cols,
        }))
      )
      .returning()
    const plotIdByNumber = new Map(insertedPlots.map((p) => [p.plotNumber, p.id]))

    const insertedHeaders = await tx
      .insert(measurementHeader)
      .values(
        specs.map((s, ordinal) => ({
          trialId: tr.id,
          measurementType: s.type,
          measurementDate: s.date,
          assessedBy: s.assessor,
          ordinal,
          origin: 'site' as const,
        }))
      )
      .returning()

    const valueRows: { measurementHeaderId: number; plotId: number; subsample: number; value: number }[] = []
    specs.forEach((_, specIndex) => {
      const headerId = insertedHeaders[specIndex].id
      for (const { plotNumber, value } of valueBySpec.get(specIndex) ?? []) {
        const plotId = plotIdByNumber.get(plotNumber)
        if (plotId != null) valueRows.push({ measurementHeaderId: headerId, plotId, subsample: 1, value })
      }
    })
    // Chunk the value insert to keep each statement well under Postgres' parameter limit.
    for (let i = 0; i < valueRows.length; i += 1000) {
      await tx.insert(measurementValue).values(valueRows.slice(i, i + 1000))
    }

    console.log(`Imported trial #${tr.id} (protocol #${proto.id}) — ${insertedHeaders.length} measurement columns, ${valueRows.length} values. Open /trial/${tr.id}.`)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
