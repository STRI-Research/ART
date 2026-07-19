import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { measurementValue, measurementHeader, plot, auditLog } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const trialId = Number(id)
  const db = getDb()

  const rows = await db
    .select({
      measurementHeaderId: measurementValue.measurementHeaderId,
      plotId: measurementValue.plotId,
      subsample: measurementValue.subsample,
      value: measurementValue.value,
    })
    .from(measurementValue)
    .innerJoin(measurementHeader, eq(measurementValue.measurementHeaderId, measurementHeader.id))
    .where(eq(measurementHeader.trialId, trialId))

  return NextResponse.json(rows)
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const trialId = Number(id)
  const db = getDb()
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const measurementHeaderId = Number(body.measurementHeaderId)
  const plotId = Number(body.plotId)
  const subsample = Number(body.subsample ?? 1)
  const value = body.value === null || body.value === undefined ? null : Number(body.value)
  if (
    !Number.isInteger(measurementHeaderId) ||
    !Number.isInteger(plotId) ||
    !Number.isInteger(subsample) ||
    subsample < 1
  ) {
    return NextResponse.json({ error: 'Invalid header, plot, or subsample' }, { status: 400 })
  }
  // A non-numeric value must not be coerced to NaN and written into the numeric column.
  if (value !== null && !Number.isFinite(value)) {
    return NextResponse.json({ error: 'Value must be a number or null' }, { status: 400 })
  }

  const [header] = await db
    .select()
    .from(measurementHeader)
    .where(and(eq(measurementHeader.id, measurementHeaderId), eq(measurementHeader.trialId, trialId)))
  if (!header) return NextResponse.json({ error: 'Measurement header not found' }, { status: 400 })

  // Guard the cross-trial write: the plot must belong to this same trial, otherwise a value keyed to
  // trial A's header and trial B's plot would silently corrupt analysis data.
  const [ownPlot] = await db
    .select({ id: plot.id })
    .from(plot)
    .where(and(eq(plot.id, plotId), eq(plot.trialId, trialId)))
  if (!ownPlot) return NextResponse.json({ error: 'Plot not found for this trial' }, { status: 400 })

  if (value === null) {
    await db
      .delete(measurementValue)
      .where(
        and(
          eq(measurementValue.measurementHeaderId, measurementHeaderId),
          eq(measurementValue.plotId, plotId),
          eq(measurementValue.subsample, subsample)
        )
      )
  } else {
    await db
      .insert(measurementValue)
      .values({ measurementHeaderId, plotId, subsample, value })
      .onConflictDoUpdate({
        target: [measurementValue.measurementHeaderId, measurementValue.plotId, measurementValue.subsample],
        set: { value },
      })
  }

  try {
    await db.insert(auditLog).values({
      trialId,
      role: 'trial',
      actor: req.headers.get('x-vercel-user-email') ?? 'web',
      action: 'measurement.value.set',
      entity: `measurement_header:${measurementHeaderId}`,
      summary: value === null
        ? `Cleared value for plot ${plotId}, header ${measurementHeaderId}, subsample ${subsample}`
        : `Set value ${value} for plot ${plotId}, header ${measurementHeaderId}, subsample ${subsample}`,
      detail: JSON.stringify({ measurementHeaderId, plotId, subsample, value, count: 1 }),
    })
  } catch {}

  return NextResponse.json({ ok: true })
}
