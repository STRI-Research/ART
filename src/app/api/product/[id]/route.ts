import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { product, treatmentComponent } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { Product } from '@shared/types'
import { logAudit } from '@/lib/audit'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const productId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [existing] = await db.select().from(product).where(eq(product.id, productId))
  if (!existing) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const parsed = Product.partial().safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  const p = parsed.data

  const min = p.minRateValue !== undefined ? p.minRateValue : existing.minRateValue
  const max = p.maxRateValue !== undefined ? p.maxRateValue : existing.maxRateValue
  if (min != null && max != null && min > max) {
    return NextResponse.json({ error: 'Minimum rate exceeds maximum rate' }, { status: 400 })
  }

  const [row] = await db
    .update(product)
    .set({
      name: p.name ?? existing.name,
      code: p.code ?? existing.code,
      mappNumber: p.mappNumber ?? existing.mappNumber,
      formulationType: p.formulationType ?? existing.formulationType,
      physicalForm: p.physicalForm ?? existing.physicalForm,
      defaultRateValue: p.defaultRateValue !== undefined ? p.defaultRateValue : existing.defaultRateValue,
      defaultRateUnit: p.defaultRateUnit ?? existing.defaultRateUnit,
      minRateValue: min,
      maxRateValue: max,
      defaultWaterVolLPerHa:
        p.defaultWaterVolLPerHa !== undefined ? p.defaultWaterVolLPerHa : existing.defaultWaterVolLPerHa,
      manufacturer: p.manufacturer ?? existing.manufacturer,
      active: p.active ?? existing.active,
      notes: p.notes ?? existing.notes,
      updatedAt: new Date(),
    })
    .where(eq(product.id, productId))
    .returning()

  const changed = Object.keys(p).filter(
    (k) => (p as Record<string, unknown>)[k] !== (existing as Record<string, unknown>)[k]
  )
  await logAudit(db, {
    role: 'protocol',
    action: 'product.edit',
    entity: `product:${productId}`,
    summary: `Edited product "${row.name}"${changed.length ? ` — ${changed.join(', ')}` : ''}`,
    before: Object.fromEntries(changed.map((k) => [k, (existing as Record<string, unknown>)[k]])),
    after: Object.fromEntries(changed.map((k) => [k, (p as Record<string, unknown>)[k]])),
  })

  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const productId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [existing] = await db.select().from(product).where(eq(product.id, productId))
  if (!existing) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  // Referenced products are deactivated, never hard-deleted — components/history keep their FK.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(treatmentComponent)
    .where(eq(treatmentComponent.productId, productId))

  if (Number(count) > 0) {
    await db.update(product).set({ active: false, updatedAt: new Date() }).where(eq(product.id, productId))
    await logAudit(db, {
      role: 'protocol',
      action: 'product.deactivate',
      entity: `product:${productId}`,
      summary: `Deactivated product "${existing.name}" (referenced by ${count} component(s))`,
    })
    return NextResponse.json({ ok: true, deactivated: true })
  }

  await db.delete(product).where(eq(product.id, productId))
  await logAudit(db, {
    role: 'protocol',
    action: 'product.delete',
    entity: `product:${productId}`,
    summary: `Deleted product "${existing.name}"`,
  })
  return NextResponse.json({ ok: true, deactivated: false })
}
