import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { measurementValue, measurementHeader, auditLog } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getActor } from '@/lib/actor'

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
  const body = await req.json()

  const measurementHeaderId = Number(body.measurementHeaderId)
  const plotId = Number(body.plotId)
  const subsample = Number(body.subsample ?? 1)
  const value = body.value === null || body.value === undefined ? null : Number(body.value)

  const [header] = await db
    .select()
    .from(measurementHeader)
    .where(and(eq(measurementHeader.id, measurementHeaderId), eq(measurementHeader.trialId, trialId)))
  if (!header) return NextResponse.json({ error: 'Measurement header not found' }, { status: 400 })

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
    const actor = await getActor()
    await db.insert(auditLog).values({
      trialId,
      role: 'trial',
      actor,
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
