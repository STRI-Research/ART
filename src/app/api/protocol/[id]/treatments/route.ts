import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { protocol, treatment, treatmentApplication, trial, auditLog } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { Treatment } from '@shared/types'
import { z } from 'zod'
import { getActor } from '@/lib/actor'
import { logAudit } from '@/lib/audit'
import { getSessionUser } from '@/lib/users'
import { loadTreatments } from '@/lib/treatments'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()
  return NextResponse.json(await loadTreatments(db, Number(id)))
}

/** Create a single treatment (stable-ID path — replaces the array PUT for new UI). */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const protocolId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [proto] = await db.select().from(protocol).where(eq(protocol.id, protocolId))
  if (!proto) return badRequest('Protocol not found')

  const [{ count: tc }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(trial)
    .where(eq(trial.protocolId, protocolId))
  if (Number(tc) > 0) {
    return NextResponse.json(
      { error: 'Protocol has trials — treatments cannot be added' },
      { status: 409 }
    )
  }

  const body = z
    .object({
      number: z.number().int().positive().optional(),
      name: z.string().default(''),
      isCheck: z.boolean().optional(),
      notes: z.string().default(''),
    })
    .safeParse(await req.json().catch(() => ({})))
  if (!body.success) return badRequest(body.error.message)

  const existing = await db
    .select({ number: treatment.number })
    .from(treatment)
    .where(eq(treatment.protocolId, protocolId))
  const nextNumber =
    body.data.number ?? (existing.length ? Math.max(...existing.map((t) => t.number)) + 1 : 1)
  if (existing.some((t) => t.number === nextNumber)) {
    return NextResponse.json({ error: `Treatment number ${nextNumber} already exists` }, { status: 409 })
  }

  const [row] = await db
    .insert(treatment)
    .values({
      protocolId,
      number: nextNumber,
      name: body.data.name || (nextNumber === 1 ? 'Untreated Check' : ''),
      isCheck: body.data.isCheck ?? nextNumber === 1,
      notes: body.data.notes,
    })
    .returning()

  await logAudit(db, {
    protocolId,
    role: 'protocol',
    action: 'treatment.create',
    entity: `treatment:${row.id}`,
    summary: `Created treatment ${row.number} "${row.name}"`,
    after: { number: row.number, name: row.name, isCheck: row.isCheck },
  })

  return NextResponse.json({ ...row, applications: [], components: [] })
}

/**
 * LEGACY array-replace endpoint (delete-all + reinsert). Kept only for protocols that still
 * use free-text program lines; it is rejected once a protocol has structured components,
 * because the delete would cascade into them. New code uses the per-entity routes
 * (POST here, PATCH/DELETE /api/treatment/[id], /api/treatment/[id]/components).
 */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const protocolId = Number(id)
  const db = getDb()

  const [proto] = await db.select().from(protocol).where(eq(protocol.id, protocolId))
  if (!proto) return badRequest('Protocol not found')

  const [{ count: tc }] = await db.select({ count: sql<number>`count(*)` }).from(trial).where(eq(trial.protocolId, protocolId))
  if (Number(tc) > 0) return NextResponse.json({ error: 'Protocol has trials and cannot be edited' }, { status: 409 })

  const existing = await loadTreatments(db, protocolId)
  if (existing.some((t) => t.components.length > 0)) {
    return NextResponse.json(
      { error: 'This protocol uses structured treatment components — use the per-treatment endpoints instead' },
      { status: 409 }
    )
  }

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
