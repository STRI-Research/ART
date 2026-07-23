import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { product } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import { Product } from '@shared/types'
import { logAudit } from '@/lib/audit'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const db = getDb()
  const activeOnly = req.nextUrl.searchParams.get('active') === '1'
  const rows = activeOnly
    ? await db.select().from(product).where(eq(product.active, true)).orderBy(asc(product.name))
    : await db.select().from(product).orderBy(asc(product.name))
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = Product.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  const p = parsed.data

  if (
    p.minRateValue != null &&
    p.maxRateValue != null &&
    p.minRateValue > p.maxRateValue
  ) {
    return NextResponse.json({ error: 'Minimum rate exceeds maximum rate' }, { status: 400 })
  }

  const [row] = await db
    .insert(product)
    .values({
      name: p.name,
      code: p.code,
      mappNumber: p.mappNumber,
      formulationType: p.formulationType,
      physicalForm: p.physicalForm,
      defaultRateValue: p.defaultRateValue,
      defaultRateUnit: p.defaultRateUnit,
      minRateValue: p.minRateValue,
      maxRateValue: p.maxRateValue,
      defaultWaterVolLPerHa: p.defaultWaterVolLPerHa,
      manufacturer: p.manufacturer,
      active: p.active,
      notes: p.notes,
    })
    .returning()
    .catch(() => [null as never])
  if (!row) return NextResponse.json({ error: 'A product with this name already exists' }, { status: 409 })

  await logAudit(db, {
    role: 'protocol',
    action: 'product.create',
    entity: `product:${row.id}`,
    summary: `Created product "${row.name}"`,
    after: { name: row.name, code: row.code, physicalForm: row.physicalForm },
  })

  return NextResponse.json(row)
}
