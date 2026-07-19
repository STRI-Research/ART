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
 * The parse + insert logic is shared with the in-app upload route in
 * `src/lib/import/assessmentSheet.ts`. This script just wraps it for the command line.
 *
 * Usage:
 *   POSTGRES_URL=... npx tsx scripts/import-assessment-sheet.ts <file.xlsx> [--title "..."] [--dry-run]
 */

import ExcelJS from 'exceljs'
import { getDb } from '../src/lib/db'
import { parseAssessmentWorkbook, insertParsedTrial } from '../src/lib/import/assessmentSheet'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 ? process.argv[i + 1] : undefined
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
  const parsed = parseAssessmentWorkbook(wb, { title: arg('title') })
  const s = parsed.summary

  console.log(`\nImport plan for "${parsed.title}":`)
  console.log(`  design:            ${parsed.design}`)
  console.log(`  treatments:        ${s.treatments}  (${parsed.treatments.map((t) => `${t.number}:${t.name}${t.isCheck ? '*' : ''}`).join(', ')})`)
  console.log(`  replicates/blocks: ${s.reps}`)
  console.log(`  plots:             ${s.plots}`)
  console.log(`  assessment dates:  ${s.dates}`)
  console.log(`  measurement types: ${s.measurementTypes.length}  (${s.measurementTypes.join(', ')})`)
  console.log(`  measurement cols:  ${s.columns}  (types × dates)`)
  console.log(`  values:            ${s.values}\n`)
  if (s.missingTreatmentNames.length) {
    console.log(`  note: no Trial Plan name for treatment(s) ${s.missingTreatmentNames.join(', ')} — used "Treatment N".`)
  }

  if (dryRun) {
    console.log('--dry-run: nothing written.')
    return
  }
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL is not set — set it (or use --dry-run).')
    process.exit(1)
  }

  const res = await insertParsedTrial(getDb(), parsed)
  console.log(`Imported trial #${res.trialId} (protocol #${res.protocolId}) — ${res.headerCount} measurement columns, ${res.valueCount} values. Open /trial/${res.trialId}.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
