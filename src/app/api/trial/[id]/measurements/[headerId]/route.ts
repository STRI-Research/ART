import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { measurementHeader } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; headerId: string }> }

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

async function findHeader(trialId: number, headerId: number) {
  const db = getDb()
  const [row] = await db
    .select()
    .from(measurementHeader)
    .where(and(eq(measurementHeader.id, headerId), eq(measurementHeader.trialId, trialId)))
  return row
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id, headerId } = await ctx.params
  const trialId = Number(id)

  const existing = await findHeader(trialId, Number(headerId))
  if (!existing) return badRequest('Measurement header not found')

  const body = await req.json()
  const db = getDb()

  const [updated] = await db
    .update(measurementHeader)
    .set({
      partMeasured: body.partMeasured ?? existing.partMeasured,
      measurementType: body.measurementType ?? existing.measurementType,
      measurementUnit: body.measurementUnit ?? existing.measurementUnit,
      applicationRef: body.applicationRef ?? existing.applicationRef,
      daysAfter: body.daysAfter ?? existing.daysAfter,
      timing: body.timing ?? existing.timing,
      description: body.description ?? existing.description,
      ordinal: body.ordinal ?? existing.ordinal,
      analyze: body.analyze ?? existing.analyze,
      subsamples: Math.max(1, body.subsamples ?? existing.subsamples),
      formula: body.formula ?? existing.formula,
    })
    .where(eq(measurementHeader.id, existing.id))
    .returning()

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id, headerId } = await ctx.params
  const trialId = Number(id)

  const existing = await findHeader(trialId, Number(headerId))
  if (!existing) return badRequest('Measurement header not found')
  if (existing.origin === 'core' || existing.locked)
    return badRequest('Cannot delete a locked/core measurement column')

  const db = getDb()
  await db.delete(measurementHeader).where(eq(measurementHeader.id, existing.id))

  return NextResponse.json({ ok: true })
}
