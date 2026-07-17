import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import {
  protocol,
  treatment,
  treatmentApplication,
  application,
  measurementDef,
} from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()

  const [proto] = await db
    .select()
    .from(protocol)
    .where(eq(protocol.id, Number(id)))
  if (!proto) return badRequest('Protocol not found')

  const treatments = await db
    .select()
    .from(treatment)
    .where(eq(treatment.protocolId, proto.id))
    .orderBy(asc(treatment.number))

  const trtIds = treatments.map((t) => t.id)
  const allTrtApps =
    trtIds.length > 0
      ? await db
          .select()
          .from(treatmentApplication)
          .orderBy(
            asc(treatmentApplication.treatmentId),
            asc(treatmentApplication.ordinal)
          )
      : []

  const apps = await db
    .select()
    .from(application)
    .where(eq(application.protocolId, proto.id))
    .orderBy(asc(application.ordinal))

  const defs = await db
    .select()
    .from(measurementDef)
    .where(eq(measurementDef.protocolId, proto.id))
    .orderBy(asc(measurementDef.ordinal))

  const trtAppsByTrt = new Map<number, (typeof allTrtApps)[number][]>()
  for (const ta of allTrtApps) {
    const arr = trtAppsByTrt.get(ta.treatmentId) ?? []
    arr.push(ta)
    trtAppsByTrt.set(ta.treatmentId, arr)
  }

  return NextResponse.json({
    protocol: proto,
    treatments: treatments.map((t) => ({
      ...t,
      applications: trtAppsByTrt.get(t.id) ?? [],
    })),
    applications: apps,
    measurementDefs: defs,
  })
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()

  const [proto] = await db
    .select()
    .from(protocol)
    .where(eq(protocol.id, Number(id)))
  if (!proto) return badRequest('Protocol not found')

  const body = await req.json()

  const [updated] = await db
    .update(protocol)
    .set({
      title: body.title ?? proto.title,
      crop: body.crop ?? proto.crop,
      targetPest: body.targetPest ?? proto.targetPest,
      objective: body.objective ?? proto.objective,
      investigator: body.investigator ?? proto.investigator,
      season: body.season ?? proto.season,
      notes: body.notes ?? proto.notes,
      design: body.design ?? proto.design,
      replicates: body.replicates ?? proto.replicates,
      blockSize: body.blockSize ?? proto.blockSize,
      plotWidth: body.plotWidth ?? proto.plotWidth,
      plotLength: body.plotLength ?? proto.plotLength,
      updatedAt: new Date(),
    })
    .where(eq(protocol.id, proto.id))
    .returning()

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()

  const [proto] = await db
    .select()
    .from(protocol)
    .where(eq(protocol.id, Number(id)))
  if (!proto) return badRequest('Protocol not found')

  await db.delete(protocol).where(eq(protocol.id, proto.id))
  return NextResponse.json({ ok: true })
}
