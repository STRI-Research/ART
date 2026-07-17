import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { libraryTerm } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()
  const body = await req.json()

  const [updated] = await db
    .update(libraryTerm)
    .set({
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.value !== undefined ? { value: body.value } : {}),
    })
    .where(eq(libraryTerm.id, Number(id)))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Term not found' }, { status: 404 })
  }

  return NextResponse.json({
    ...updated,
    crops: updated.crops ? updated.crops.split(',').filter(Boolean) : [],
  })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()

  await db.delete(libraryTerm).where(eq(libraryTerm.id, Number(id)))
  return NextResponse.json({ ok: true })
}
