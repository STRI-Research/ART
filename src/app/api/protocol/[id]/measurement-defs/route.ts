import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { protocol, measurementDef, trial, auditLog } from '@/lib/db/schema'
import { asc, eq, sql } from 'drizzle-orm'
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

  const [{ count: tc }] = await db.select({ count: sql<number>`count(*)` }).from(trial).where(eq(trial.protocolId, protocolId))
  if (Number(tc) > 0) return NextResponse.json({ error: 'Protocol has trials and cannot be edited' }, { status: 409 })

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

  try {
    await db.insert(auditLog).values({
      protocolId,
      role: 'protocol',
      actor: req.headers.get('x-vercel-user-email') ?? 'web',
      action: 'measurement.def.replace',
      entity: `protocol:${protocolId}`,
      summary: `Replaced measurement definitions for protocol ${protocolId} — ${saved.length} definition(s)`,
      detail: JSON.stringify({ count: saved.length }),
    })
  } catch {}

  return NextResponse.json(saved)
}
