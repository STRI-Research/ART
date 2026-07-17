import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { libraryTerm } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const numId = Number(id)
  const db = getDb()
  const body = await req.json()

  // Fetch the term being edited
  const [existing] = await db.select().from(libraryTerm).where(eq(libraryTerm.id, numId))
  if (!existing) {
    return NextResponse.json({ error: 'Term not found' }, { status: 404 })
  }

  const newValue = body.value !== undefined ? body.value : existing.value

  // If value is changing, check for a merge target
  if (body.value !== undefined && body.value !== existing.value) {
    const [target] = await db
      .select()
      .from(libraryTerm)
      .where(
        and(
          eq(libraryTerm.category, existing.category),
          eq(libraryTerm.value, newValue)
        )
      )

    if (target) {
      // Merge: sum usage counts, union crops, keep target's label (or fill if empty)
      const oldCrops = existing.crops ? existing.crops.split(',').filter(Boolean) : []
      const targetCrops = target.crops ? target.crops.split(',').filter(Boolean) : []
      const unionCrops = [...new Set([...targetCrops, ...oldCrops])]

      const [merged] = await db
        .update(libraryTerm)
        .set({
          useCount: target.useCount + existing.useCount,
          crops: unionCrops.join(','),
          label: target.label || existing.label,
        })
        .where(eq(libraryTerm.id, target.id))
        .returning()

      // Delete the old term
      await db.delete(libraryTerm).where(eq(libraryTerm.id, numId))

      return NextResponse.json({
        ...merged,
        crops: merged.crops ? merged.crops.split(',').filter(Boolean) : [],
      })
    }
  }

  // No merge needed — plain update
  const [updated] = await db
    .update(libraryTerm)
    .set({
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.value !== undefined ? { value: body.value } : {}),
    })
    .where(eq(libraryTerm.id, numId))
    .returning()

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
