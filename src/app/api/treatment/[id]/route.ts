import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { treatment, trial, plot } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { logAudit } from '@/lib/audit'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function protocolHasTrials(db: ReturnType<typeof getDb>, protocolId: number): Promise<boolean> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(trial)
    .where(eq(trial.protocolId, protocolId))
  return Number(count) > 0
}

/**
 * Stable-ID treatment update. Cosmetic fields (name, notes, type) are editable at any time —
 * plots reference the treatment by id, so renames are safe post-trial. Definition fields
 * (number, isCheck) alter the experiment and stay locked once trials exist. Optimistic
 * concurrency via `expectedVersion`.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const treatmentId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [existing] = await db.select().from(treatment).where(eq(treatment.id, treatmentId))
  if (!existing) return NextResponse.json({ error: 'Treatment not found' }, { status: 404 })

  const body = z
    .object({
      name: z.string().optional(),
      notes: z.string().optional(),
      type: z.string().optional(),
      number: z.number().int().positive().optional(),
      isCheck: z.boolean().optional(),
      expectedVersion: z.number().int().optional(),
    })
    .safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: body.error.message }, { status: 400 })
  const patch = body.data

  if (patch.expectedVersion !== undefined && patch.expectedVersion !== existing.version) {
    return NextResponse.json(
      { error: 'Treatment was modified by someone else — reload before saving', current: existing },
      { status: 409 }
    )
  }

  const definitionChange =
    (patch.number !== undefined && patch.number !== existing.number) ||
    (patch.isCheck !== undefined && patch.isCheck !== existing.isCheck)
  if (definitionChange && (await protocolHasTrials(db, existing.protocolId))) {
    return NextResponse.json(
      { error: 'Protocol has trials — treatment number and check status cannot change' },
      { status: 409 }
    )
  }

  if (patch.number !== undefined && patch.number !== existing.number) {
    const clash = await db
      .select({ id: treatment.id })
      .from(treatment)
      .where(sql`${treatment.protocolId} = ${existing.protocolId} AND ${treatment.number} = ${patch.number}`)
    if (clash.length) {
      return NextResponse.json({ error: `Treatment number ${patch.number} already exists` }, { status: 409 })
    }
  }

  const [row] = await db
    .update(treatment)
    .set({
      name: patch.name ?? existing.name,
      notes: patch.notes ?? existing.notes,
      type: patch.type ?? existing.type,
      number: patch.number ?? existing.number,
      isCheck: patch.isCheck ?? existing.isCheck,
      version: existing.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(treatment.id, treatmentId))
    .returning()

  const fields = ['name', 'notes', 'type', 'number', 'isCheck'] as const
  const changed = fields.filter((f) => patch[f] !== undefined && patch[f] !== existing[f])
  if (changed.length) {
    await logAudit(db, {
      protocolId: existing.protocolId,
      role: 'protocol',
      action: changed.includes('name') ? 'treatment.rename' : 'treatment.edit',
      entity: `treatment:${treatmentId}`,
      summary: `Edited treatment ${row.number} — ${changed.join(', ')}`,
      before: Object.fromEntries(changed.map((f) => [f, existing[f]])),
      after: Object.fromEntries(changed.map((f) => [f, row[f]])),
    })
  }

  return NextResponse.json(row)
}

/** Delete a treatment. Refused when any plot references it — never cascades into trial data. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const treatmentId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [existing] = await db.select().from(treatment).where(eq(treatment.id, treatmentId))
  if (!existing) return NextResponse.json({ error: 'Treatment not found' }, { status: 404 })

  const [{ count: plotCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(plot)
    .where(eq(plot.treatmentId, treatmentId))
  if (Number(plotCount) > 0) {
    return NextResponse.json(
      { error: `Treatment ${existing.number} is assigned to ${plotCount} plot(s) and cannot be deleted` },
      { status: 409 }
    )
  }
  if (await protocolHasTrials(db, existing.protocolId)) {
    return NextResponse.json(
      { error: 'Protocol has trials — treatments cannot be deleted' },
      { status: 409 }
    )
  }

  await db.delete(treatment).where(eq(treatment.id, treatmentId))
  await logAudit(db, {
    protocolId: existing.protocolId,
    role: 'protocol',
    action: 'treatment.delete',
    entity: `treatment:${treatmentId}`,
    summary: `Deleted treatment ${existing.number} "${existing.name}"`,
    before: { number: existing.number, name: existing.name, isCheck: existing.isCheck },
  })
  return NextResponse.json({ ok: true })
}
