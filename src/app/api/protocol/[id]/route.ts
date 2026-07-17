import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import {
  protocol,
  treatment,
  treatmentApplication,
  application,
  measurementDef,
} from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { unauthorized, badRequest } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function protocolById(userId: string, id: number) {
  const db = getDb()
  const [row] = await db
    .select()
    .from(protocol)
    .where(and(eq(protocol.id, id), eq(protocol.userId, userId)))
  return row ?? null
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const { id } = await ctx.params
  const proto = await protocolById(session.user.id, Number(id))
  if (!proto) return badRequest('Protocol not found')

  const db = getDb()

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
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const { id } = await ctx.params
  const proto = await protocolById(session.user.id, Number(id))
  if (!proto) return badRequest('Protocol not found')

  const db = getDb()
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
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const { id } = await ctx.params
  const proto = await protocolById(session.user.id, Number(id))
  if (!proto) return badRequest('Protocol not found')

  const db = getDb()
  await db.delete(protocol).where(eq(protocol.id, proto.id))
  return NextResponse.json({ ok: true })
}
