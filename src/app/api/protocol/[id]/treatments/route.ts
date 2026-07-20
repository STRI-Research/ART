import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { protocol, treatment, treatmentApplication, trial, auditLog } from '@/lib/db/schema'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { Treatment } from '@shared/types'
import { z } from 'zod'
import { getActor } from '@/lib/actor'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const protocolId = Number(id)
  const db = getDb()

  const rows = await db
    .select()
    .from(treatment)
    .where(eq(treatment.protocolId, protocolId))
    .orderBy(asc(treatment.number))

  const trtIds = rows.map((t) => t.id)
  const apps = trtIds.length
    ? await db
        .select()
        .from(treatmentApplication)
        .where(inArray(treatmentApplication.treatmentId, trtIds))
        .orderBy(asc(treatmentApplication.treatmentId), asc(treatmentApplication.ordinal))
    : []

  const byTreatment = new Map<number, typeof apps>()
  for (const a of apps) {
    const arr = byTreatment.get(a.treatmentId) ?? []
    arr.push(a)
    byTreatment.set(a.treatmentId, arr)
  }

  return NextResponse.json(rows.map((t) => ({ ...t, applications: byTreatment.get(t.id) ?? [] })))
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const protocolId = Number(id)
  const db = getDb()

  const [proto] = await db.select().from(protocol).where(eq(protocol.id, protocolId))
  if (!proto) return badRequest('Protocol not found')

  const [{ count: tc }] = await db.select({ count: sql<number>`count(*)` }).from(trial).where(eq(trial.protocolId, protocolId))
  if (Number(tc) > 0) return NextResponse.json({ error: 'Protocol has trials and cannot be edited' }, { status: 409 })

  const parsed = z.array(Treatment).safeParse(await req.json())
  if (!parsed.success) return badRequest(parsed.error.message)

  await db.delete(treatment).where(eq(treatment.protocolId, protocolId))

  if (parsed.data.length === 0) return NextResponse.json([])

  // A single multi-row INSERT ... RETURNING preserves the input order, so the returned
  // rows line up positionally with parsed.data for building the application lines below.
  const insertedTreatments = await db
    .insert(treatment)
    .values(
      parsed.data.map((t) => ({
        protocolId,
        number: t.number,
        name: t.name ?? '',
        type: t.type ?? '',
        isCheck: t.isCheck ?? false,
      }))
    )
    .returning()

  const appRows = parsed.data.flatMap((t, i) =>
    (t.applications ?? []).map((a, j) => ({
      treatmentId: insertedTreatments[i].id,
      ordinal: a.ordinal ?? j,
      applicationRef: a.applicationRef ?? '',
      product: a.product ?? '',
      rate: a.rate ?? '',
      rateUnit: a.rateUnit ?? '',
    }))
  )

  const insertedApps = appRows.length
    ? await db.insert(treatmentApplication).values(appRows).returning()
    : []

  const appsByTreatment = new Map<number, typeof insertedApps>()
  for (const a of insertedApps) {
    const arr = appsByTreatment.get(a.treatmentId) ?? []
    arr.push(a)
    appsByTreatment.set(a.treatmentId, arr)
  }

  try {
    const actor = await getActor()
    await db.insert(auditLog).values({
      protocolId,
      role: 'protocol',
      actor,
      action: 'treatments.replace',
      entity: `protocol:${protocolId}`,
      summary: `Replaced treatments for protocol ${protocolId} — ${insertedTreatments.length} treatment(s)`,
      detail: JSON.stringify({ count: insertedTreatments.length, applicationRows: insertedApps.length }),
    })
  } catch {}

  return NextResponse.json(
    insertedTreatments.map((t) => ({ ...t, applications: appsByTreatment.get(t.id) ?? [] }))
  )
}
