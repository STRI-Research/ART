import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { protocol, application, measurementDef, trial, auditLog } from '@/lib/db/schema'
import { eq, asc, sql } from 'drizzle-orm'
import { getActor } from '@/lib/actor'
import { loadTreatments } from '@/lib/treatments'

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

  const treatments = await loadTreatments(db, proto.id)

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

  return NextResponse.json({
    protocol: proto,
    treatments,
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

  const [{ count: trialCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(trial)
    .where(eq(trial.protocolId, proto.id))
  if (Number(trialCount) > 0) {
    return NextResponse.json(
      { error: 'This protocol has trials — it cannot be edited. Make changes in a new protocol version.' },
      { status: 409 }
    )
  }

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

  try {
    const actor = await getActor()
    const fields = ['title','crop','targetPest','objective','investigator','season','notes','design','replicates','blockSize','plotWidth','plotLength']
    const changed = fields.filter((f) => body[f] !== undefined && body[f] !== (proto as Record<string, unknown>)[f])
    await db.insert(auditLog).values({
      protocolId: proto.id,
      role: 'protocol',
      actor,
      action: 'protocol.edit',
      entity: `protocol:${proto.id}`,
      summary: `Edited protocol "${updated.title}" — changed ${changed.length ? changed.join(', ') : 'fields'}`,
      detail: JSON.stringify({ changed }),
    })
  } catch {}

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()

  const [proto] = await db
    .select()
    .from(protocol)
    .where(eq(protocol.id, Number(id)))
  if (!proto) return badRequest('Protocol not found')

  await db.delete(protocol).where(eq(protocol.id, proto.id))

  try {
    const actor = await getActor()
    await db.insert(auditLog).values({
      protocolId: proto.id,
      role: 'protocol',
      actor,
      action: 'protocol.delete',
      entity: `protocol:${proto.id}`,
      summary: `Deleted protocol "${proto.title}" (UID ${proto.protocolUid})`,
      detail: JSON.stringify({ protocolId: proto.id, protocolUid: proto.protocolUid }),
    })
  } catch {}

  return NextResponse.json({ ok: true })
}
