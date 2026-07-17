import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { protocol, measurementDef } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import { MeasurementDef } from '@shared/types'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()

  const rows = await db
    .select()
    .from(measurementDef)
    .where(eq(measurementDef.protocolId, Number(id)))
    .orderBy(asc(measurementDef.ordinal))

  return NextResponse.json(rows)
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const protocolId = Number(id)
  const db = getDb()

  const [proto] = await db.select().from(protocol).where(eq(protocol.id, protocolId))
  if (!proto) return badRequest('Protocol not found')

  const parsed = z.array(MeasurementDef).safeParse(await req.json())
  if (!parsed.success) return badRequest(parsed.error.message)

  await db.delete(measurementDef).where(eq(measurementDef.protocolId, protocolId))

  const saved = parsed.data.length
    ? await db
        .insert(measurementDef)
        .values(
          parsed.data.map((d, i) => ({
            protocolId,
            partMeasured: d.partMeasured ?? '',
            measurementType: d.measurementType ?? '',
            measurementUnit: d.measurementUnit ?? '',
            applicationRef: d.applicationRef ?? '',
            daysAfter: d.daysAfter ?? null,
            timing: d.timing ?? '',
            description: d.description ?? '',
            ordinal: d.ordinal ?? i,
            analyze: d.analyze ?? true,
            subsamples: d.subsamples ?? 1,
            formula: d.formula ?? '',
          }))
        )
        .returning()
    : []

  return NextResponse.json(saved)
}
