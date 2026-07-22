import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { treatment, treatmentComponent, product, trial } from '@/lib/db/schema'
import { asc, eq, sql } from 'drizzle-orm'
import { TreatmentComponent } from '@shared/types'
import { ScheduleRule } from '@shared/schedule'
import { validateComponent } from '@shared/treatmentValidation'
import { logAudit } from '@/lib/audit'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()
  const rows = await db
    .select()
    .from(treatmentComponent)
    .where(eq(treatmentComponent.treatmentId, Number(id)))
    .orderBy(asc(treatmentComponent.ordinal))
  return NextResponse.json(rows)
}

/** Add a component (product + numeric rate + schedule rule) to a treatment. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const treatmentId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [trt] = await db.select().from(treatment).where(eq(treatment.id, treatmentId))
  if (!trt) return NextResponse.json({ error: 'Treatment not found' }, { status: 404 })

  const [{ count: tc }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(trial)
    .where(eq(trial.protocolId, trt.protocolId))
  if (Number(tc) > 0) {
    return NextResponse.json(
      { error: 'Protocol has trials — treatment programmes cannot change' },
      { status: 409 }
    )
  }

  const parsed = TreatmentComponent.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  const c = parsed.data

  const rule = ScheduleRule.safeParse(c.scheduleRule)
  if (!rule.success) return NextResponse.json({ error: 'Invalid scheduling rule' }, { status: 400 })

  const [prod] = await db.select().from(product).where(eq(product.id, c.productId))
  if (!prod) return NextResponse.json({ error: 'Product not found' }, { status: 400 })
  if (!prod.active) return NextResponse.json({ error: `Product "${prod.name}" is inactive` }, { status: 400 })

  const siblings = await db
    .select({ productId: treatmentComponent.productId })
    .from(treatmentComponent)
    .where(eq(treatmentComponent.treatmentId, treatmentId))
  const issues = validateComponent(
    { ...c, scheduleRule: rule.data },
    { name: prod.name, minRateValue: prod.minRateValue, maxRateValue: prod.maxRateValue, defaultRateUnit: prod.defaultRateUnit as never },
    siblings.map((s) => s.productId)
  )
  const errors = issues.filter((i) => i.level === 'error')
  if (errors.length) {
    return NextResponse.json({ error: errors.map((e) => e.message).join('; '), issues }, { status: 400 })
  }

  const [row] = await db
    .insert(treatmentComponent)
    .values({
      treatmentId,
      productId: c.productId,
      ordinal: c.ordinal ?? siblings.length,
      rateValue: c.rateValue,
      rateUnit: c.rateUnit,
      rateOutOfRangeReason: c.rateOutOfRangeReason,
      waterVolumeLPerHa: c.waterVolumeLPerHa ?? prod.defaultWaterVolLPerHa,
      waterIn: c.waterIn,
      inTankMix: c.inTankMix,
      scheduleRule: rule.data,
      activeFrom: c.activeFrom,
      activeUntil: c.activeUntil,
      maxOccurrences: c.maxOccurrences,
      fromOccurrence: c.fromOccurrence,
      groupName: c.groupName,
      notes: c.notes,
    })
    .returning()

  await logAudit(db, {
    protocolId: trt.protocolId,
    role: 'protocol',
    action: 'component.add',
    entity: `component:${row.id}`,
    summary: `Added ${prod.name} to treatment ${trt.number} (${row.rateValue ?? '—'} ${row.rateUnit})`,
    after: {
      product: prod.name,
      rateValue: row.rateValue,
      rateUnit: row.rateUnit,
      scheduleRule: rule.data,
    },
    reason: c.rateOutOfRangeReason || undefined,
  })

  return NextResponse.json(row)
}
