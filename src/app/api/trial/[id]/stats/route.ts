import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { measurementHeader, analysisResult, auditLog } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { runAnova } from '@/lib/stats/anova'
import { AovRequest } from '@shared/types'
import { getActor } from '@/lib/actor'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Runs the JS ANOVA engine on one measurement. The client (StatsView/ReportView) already assembled
 * `request.data` via `buildObservations`/`plotValue` — which correctly derives calculated (formula)
 * measurement columns and averages subsamples — so this route validates and re-runs that request
 * server-side rather than recomputing observations from raw rows (which would silently produce no
 * data for calculated columns, since they have no stored `measurement_value` rows).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()
  const trialId = Number(id)
  const body = await req.json()
  const headerId = Number(body.headerId)

  const [header] = await db.select().from(measurementHeader).where(eq(measurementHeader.id, headerId))
  if (!header || header.trialId !== trialId) {
    return NextResponse.json({ error: 'Measurement header not found' }, { status: 404 })
  }

  const parsed = AovRequest.safeParse(body.request)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid analysis request' }, { status: 400 })
  }
  const request = parsed.data

  const result = runAnova(request)

  // The table caches the latest analysis per header — drop any prior run before recording this one.
  await db.delete(analysisResult).where(eq(analysisResult.measurementHeaderId, headerId))
  await db.insert(analysisResult).values({
    measurementHeaderId: headerId,
    engineVersion: 'js-anova-1',
    paramsJson: JSON.stringify(request),
    resultJson: JSON.stringify(result)
  })

  try {
    const actor = await getActor()
    const trtRow = result.anova.find((r) => r.source === 'treatment')
    const label = header.description || header.measurementType || `measurement ${header.ordinal + 1}`
    const outcome = result.note ? result.note : result.significant ? 'treatment effect significant' : 'not significant'
    await db.insert(auditLog).values({
      trialId,
      role: 'trial',
      actor,
      action: 'measurement.stats.run',
      entity: `measurement_header:${headerId}`,
      summary: `Ran ${request.test} analysis (α=${request.alpha}) on "${label}" — ${outcome}`,
      detail: JSON.stringify({ test: request.test, alpha: request.alpha, n: request.data.length, pValue: trtRow?.pValue ?? null })
    })
  } catch {
    // Audit logging is best-effort; a logging failure must never fail the analysis response.
  }

  return NextResponse.json(result)
}
