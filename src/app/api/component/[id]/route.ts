import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { treatment, treatmentComponent, product, trial } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { TreatmentComponent } from '@shared/types'
import { ScheduleRule } from '@shared/schedule'
import { validateComponent } from '@shared/treatmentValidation'
import { logAudit } from '@/lib/audit'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function loadContext(db: ReturnType<typeof getDb>, componentId: number) {
  const [comp] = await db.select().from(treatmentComponent).where(eq(treatmentComponent.id, componentId))
  if (!comp) return null
  const [trt] = await db.select().from(treatment).where(eq(treatment.id, comp.treatmentId))
  if (!trt) return null
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(trial)
    .where(eq(trial.protocolId, trt.protocolId))
  return { comp, trt, hasTrials: Number(count) > 0 }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const componentId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const found = await loadContext(db, componentId)
  if (!found) return NextResponse.json({ error: 'Component not found' }, { status: 404 })
  const { comp, trt, hasTrials } = found
  if (hasTrials) {
    return NextResponse.json(
      { error: 'Protocol has trials — treatment programmes cannot change' },
      { status: 409 }
    )
  }

  const parsed = TreatmentComponent.partial().safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  const patch = parsed.data

  const nextRule = patch.scheduleRule !== undefined ? patch.scheduleRule : comp.scheduleRule
  const rule = ScheduleRule.safeParse(nextRule)
  if (!rule.success) return NextResponse.json({ error: 'Invalid scheduling rule' }, { status: 400 })

  const nextProductId = patch.productId ?? comp.productId
  const [prod] = await db.select().from(product).where(eq(product.id, nextProductId))
  if (!prod) return NextResponse.json({ error: 'Product not found' }, { status: 400 })
  if (!prod.active && nextProductId !== comp.productId) {
    return NextResponse.json({ error: `Product "${prod.name}" is inactive` }, { status: 400 })
  }

  const merged = {
    productId: nextProductId,
    rateValue: patch.rateValue !== undefined ? patch.rateValue : comp.rateValue,
    rateUnit: (patch.rateUnit ?? comp.rateUnit) as TreatmentComponent['rateUnit'],
    rateOutOfRangeReason:
      patch.rateOutOfRangeReason !== undefined ? patch.rateOutOfRangeReason : comp.rateOutOfRangeReason,
    scheduleRule: rule.data,
  }
  const siblings = await db
    .select({ id: treatmentComponent.id, productId: treatmentComponent.productId })
    .from(treatmentComponent)
    .where(eq(treatmentComponent.treatmentId, comp.treatmentId))
  const issues = validateComponent(
    merged,
    { name: prod.name, minRateValue: prod.minRateValue, maxRateValue: prod.maxRateValue, defaultRateUnit: prod.defaultRateUnit as never },
    siblings.filter((s) => s.id !== componentId).map((s) => s.productId)
  )
  const errors = issues.filter((i) => i.level === 'error')
  if (errors.length) {
    return NextResponse.json({ error: errors.map((e) => e.message).join('; '), issues }, { status: 400 })
  }

  const [row] = await db
    .update(treatmentComponent)
    .set({
      productId: merged.productId,
      ordinal: patch.ordinal ?? comp.ordinal,
      rateValue: merged.rateValue,
      rateUnit: merged.rateUnit,
      rateOutOfRangeReason: merged.rateOutOfRangeReason,
      waterVolumeLPerHa:
        patch.waterVolumeLPerHa !== undefined ? patch.waterVolumeLPerHa : comp.waterVolumeLPerHa,
      waterIn: patch.waterIn ?? comp.waterIn,
      inTankMix: patch.inTankMix ?? comp.inTankMix,
      scheduleRule: rule.data,
      activeFrom: patch.activeFrom ?? comp.activeFrom,
      activeUntil: patch.activeUntil ?? comp.activeUntil,
      maxOccurrences: patch.maxOccurrences !== undefined ? patch.maxOccurrences : comp.maxOccurrences,
      fromOccurrence: patch.fromOccurrence !== undefined ? patch.fromOccurrence : comp.fromOccurrence,
      groupName: patch.groupName ?? comp.groupName,
      notes: patch.notes ?? comp.notes,
      updatedAt: new Date(),
    })
    .where(eq(treatmentComponent.id, componentId))
    .returning()

  const watched = ['productId', 'rateValue', 'rateUnit', 'waterVolumeLPerHa', 'scheduleRule'] as const
  const changed = watched.filter(
    (f) => JSON.stringify(row[f]) !== JSON.stringify(comp[f])
  )
  if (changed.length) {
    const action = changed.includes('productId')
      ? 'component.product.change'
      : changed.includes('rateValue') || changed.includes('rateUnit')
        ? 'component.rate.change'
        : changed.includes('scheduleRule')
          ? 'component.rule.change'
          : 'component.edit'
    await logAudit(db, {
      protocolId: trt.protocolId,
      role: 'protocol',
      action,
      entity: `component:${componentId}`,
      summary: `Edited ${prod.name} in treatment ${trt.number} — ${changed.join(', ')}`,
      before: Object.fromEntries(changed.map((f) => [f, comp[f]])),
      after: Object.fromEntries(changed.map((f) => [f, row[f]])),
      reason: merged.rateOutOfRangeReason || undefined,
    })
  }

  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const componentId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const found = await loadContext(db, componentId)
  if (!found) return NextResponse.json({ error: 'Component not found' }, { status: 404 })
  const { comp, trt, hasTrials } = found
  if (hasTrials) {
    return NextResponse.json(
      { error: 'Protocol has trials — treatment programmes cannot change' },
      { status: 409 }
    )
  }

  const [prod] = await db.select().from(product).where(eq(product.id, comp.productId))
  await db.delete(treatmentComponent).where(eq(treatmentComponent.id, componentId))
  await logAudit(db, {
    protocolId: trt.protocolId,
    role: 'protocol',
    action: 'component.remove',
    entity: `component:${componentId}`,
    summary: `Removed ${prod?.name ?? 'product'} from treatment ${trt.number}`,
    before: { product: prod?.name, rateValue: comp.rateValue, rateUnit: comp.rateUnit },
  })
  return NextResponse.json({ ok: true })
}
