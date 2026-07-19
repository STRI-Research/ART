/**
 * Shared logic for importing an STRI assessment-sheet workbook into a trial. Used by both the CLI
 * script (`scripts/import-assessment-sheet.ts`) and the in-app upload route
 * (`/api/import/assessment-sheet`). See the script header for the expected workbook shape.
 *
 * `parseAssessmentWorkbook` is pure (workbook → structured plan, throws on an unrecognised shape);
 * `insertParsedTrial` performs the single-transaction write.
 */

import type ExcelJS from 'exceljs'
import { protocol, treatment, trial, plot, measurementHeader, measurementValue } from '../db/schema'
import { withTransaction } from '../db/tx'

type Cell = ExcelJS.Cell

export interface ParsedAssessmentTrial {
  title: string
  design: 'RCB'
  treatments: { number: number; name: string; isCheck: boolean }[]
  reps: number
  plots: { plotNumber: number; rep: number; block: number; treatmentNumber: number }[]
  /** One entry per (measurement type × assessment date). */
  specs: { type: string; date: string; assessor: string }[]
  /** Values aligned to `specs` by index: valuesBySpec[i] holds {plotNumber, value} for specs[i]. */
  valuesBySpec: { plotNumber: number; value: number }[][]
  summary: {
    treatments: number
    reps: number
    plots: number
    dates: number
    measurementTypes: string[]
    columns: number
    values: number
    missingTreatmentNames: number[]
  }
}

export interface ImportResult {
  trialId: number
  protocolId: number
  headerCount: number
  valueCount: number
}

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

export class AssessmentSheetError extends Error {}

export function parseAssessmentWorkbook(
  wb: ExcelJS.Workbook,
  opts: { title?: string } = {}
): ParsedAssessmentTrial {
  // Treatments from the Trial Plan sheet ("[n] Name").
  const planSheet = wb.worksheets.find((w) => /plan/i.test(w.name))
  const trtName = new Map<number, string>()
  if (planSheet) {
    planSheet.eachRow((row) => {
      const m = cellStr(row.getCell(1)).match(/^\[(\d+)\]\s*(.+)$/)
      if (m) trtName.set(Number(m[1]), m[2].trim())
    })
  }

  // Data sheets: header row 7 begins "Block!".
  const dataSheets = wb.worksheets.filter((w) => /^block/i.test(cellStr(w.getCell(7, 1))))
  if (dataSheets.length === 0) {
    throw new AssessmentSheetError(
      'No assessment-date sheets found (expected a "Block!/Plot!/Treat1!" header on row 7).'
    )
  }

  const first = dataSheets[0]
  const title =
    opts.title || cellStr(first.getCell('D1')) || 'Imported trial'

  // Locate key columns on the header row (row 7).
  const headerCells: { col: number; label: string }[] = []
  first.getRow(7).eachCell((cell, col) => headerCells.push({ col, label: cellStr(cell).replace(/!$/, '').trim() }))
  const findCol = (re: RegExp) => headerCells.find((h) => re.test(h.label))?.col
  const cBlock = findCol(/^block$/i)
  const cPlot = findCol(/^plot$/i)
  const cTreat = findCol(/^treat/i)
  if (!cBlock || !cPlot || !cTreat) {
    throw new AssessmentSheetError('Could not find Block / Plot / Treat columns on row 7.')
  }
  const isKeyCol = (col: number) => col === cBlock || col === cPlot || col === cTreat

  // Plots from the first sheet.
  const plots: ParsedAssessmentTrial['plots'] = []
  for (let r = 8; r <= first.rowCount; r++) {
    const pn = cellNum(first.getCell(r, cPlot))
    const bl = cellNum(first.getCell(r, cBlock))
    const tr = cellNum(first.getCell(r, cTreat))
    if (pn == null || tr == null) continue
    plots.push({ plotNumber: pn, rep: bl ?? 1, block: bl ?? 1, treatmentNumber: tr })
  }
  if (plots.length === 0) throw new AssessmentSheetError('No plot rows found under the header.')

  const treatmentNumbers = [...new Set(plots.map((p) => p.treatmentNumber))].sort((a, b) => a - b)
  const reps = [...new Set(plots.map((p) => p.rep))]

  // Measurement headers: one per (date sheet × measurement column).
  const specs: ParsedAssessmentTrial['specs'] = []
  const valuesBySpec: ParsedAssessmentTrial['valuesBySpec'] = []
  for (const ws of dataSheets) {
    const date = sheetDateToIso(ws.name)
    const assessor = cellStr(ws.getCell('B4'))
    const measCols: { col: number; type: string }[] = []
    ws.getRow(7).eachCell((cell, col) => {
      const label = cellStr(cell).replace(/!$/, '').trim()
      if (label && !isKeyCol(col)) measCols.push({ col, type: label })
    })
    for (const mc of measCols) {
      const vals: { plotNumber: number; value: number }[] = []
      for (let r = 8; r <= ws.rowCount; r++) {
        const pn = cellNum(ws.getCell(r, cPlot))
        if (pn == null) continue
        const v = cellNum(ws.getCell(r, mc.col))
        if (v != null) vals.push({ plotNumber: pn, value: v })
      }
      specs.push({ type: mc.type, date, assessor })
      valuesBySpec.push(vals)
    }
  }

  const measurementTypes = [...new Set(specs.map((s) => s.type))]
  const values = valuesBySpec.reduce((s, a) => s + a.length, 0)

  return {
    title,
    design: 'RCB',
    treatments: treatmentNumbers.map((n) => ({
      number: n,
      name: trtName.get(n) ?? `Treatment ${n}`,
      isCheck: /untreated|^utc$|control/i.test(trtName.get(n) ?? ''),
    })),
    reps: reps.length,
    plots,
    specs,
    valuesBySpec,
    summary: {
      treatments: treatmentNumbers.length,
      reps: reps.length,
      plots: plots.length,
      dates: dataSheets.length,
      measurementTypes,
      columns: specs.length,
      values,
      missingTreatmentNames: treatmentNumbers.filter((n) => !trtName.has(n)),
    },
  }
}

export async function insertParsedTrial(parsed: ParsedAssessmentTrial): Promise<ImportResult> {
  return withTransaction(async (tx) => {
    const [proto] = await tx
      .insert(protocol)
      .values({ title: parsed.title, design: parsed.design, replicates: parsed.reps })
      .returning()

    const insertedTrts = await tx
      .insert(treatment)
      .values(parsed.treatments.map((t) => ({ protocolId: proto.id, number: t.number, name: t.name, isCheck: t.isCheck })))
      .returning()
    const trtIdByNumber = new Map(insertedTrts.map((t) => [t.number, t.id]))

    const cols = parsed.treatments.length || 1
    const [tr] = await tx
      .insert(trial)
      .values({
        protocolId: proto.id,
        plotRows: Math.ceil(parsed.plots.length / cols),
        plotCols: cols,
        seed: 0,
        siteName: parsed.title,
      })
      .returning()

    const ordered = [...parsed.plots].sort((a, b) => a.plotNumber - b.plotNumber)
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
        parsed.specs.map((s, ordinal) => ({
          trialId: tr.id,
          measurementType: s.type,
          measurementDate: s.date,
          assessedBy: s.assessor,
          ordinal,
          origin: 'site' as const,
        }))
      )
      .returning()

    // De-duplicate by the value primary key (header, plot, subsample); a repeated plot row in a
    // sheet would otherwise violate it. Last value wins.
    const valueByKey = new Map<string, { measurementHeaderId: number; plotId: number; subsample: number; value: number }>()
    parsed.valuesBySpec.forEach((vals, specIndex) => {
      const headerId = insertedHeaders[specIndex].id
      for (const { plotNumber, value } of vals) {
        const plotId = plotIdByNumber.get(plotNumber)
        if (plotId != null) valueByKey.set(`${headerId}:${plotId}:1`, { measurementHeaderId: headerId, plotId, subsample: 1, value })
      }
    })
    const valueRows = [...valueByKey.values()]
    for (let i = 0; i < valueRows.length; i += 1000) {
      await tx.insert(measurementValue).values(valueRows.slice(i, i + 1000))
    }

    return { trialId: tr.id, protocolId: proto.id, headerCount: insertedHeaders.length, valueCount: valueRows.length }
  })
}
