import { NextResponse, type NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { getDb } from '@/lib/db'
import {
  parseAssessmentWorkbook,
  insertParsedTrial,
  AssessmentSheetError,
} from '@/lib/import/assessmentSheet'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs' // exceljs + the ws-backed DB driver need the Node runtime

export async function POST(req: NextRequest) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected a multipart file upload.' }, { status: 400 })
  }

  const file = form.get('file')
  const title = form.get('title')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  }

  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ error: 'Could not read the file as an .xlsx workbook.' }, { status: 400 })
  }

  let parsed
  try {
    parsed = parseAssessmentWorkbook(wb, { title: typeof title === 'string' && title ? title : undefined })
  } catch (e) {
    // A recognised "wrong shape" is the caller's fault (400); anything else is unexpected (500).
    if (e instanceof AssessmentSheetError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to parse the workbook.' }, { status: 400 })
  }

  try {
    const res = await insertParsedTrial(getDb(), parsed)
    return NextResponse.json({ ...res, summary: parsed.summary, title: parsed.title })
  } catch {
    return NextResponse.json({ error: 'Import failed while writing to the database.' }, { status: 500 })
  }
}
