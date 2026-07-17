import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { libraryTerm } from '@/lib/db/schema'
import { and, asc, desc, eq, ilike, or } from 'drizzle-orm'
import { LibraryCategory, isCropScoped } from '@shared/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const categoryParam = searchParams.get('category') ?? ''
  const query = (searchParams.get('query') ?? '').trim()
  const crop = (searchParams.get('crop') ?? '').trim()

  const categoryResult = LibraryCategory.safeParse(categoryParam)
  if (!categoryResult.success) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }
  const category = categoryResult.data

  const db = getDb()
  const conditions = [eq(libraryTerm.category, category)]
  if (query) {
    const like = `%${query}%`
    conditions.push(or(ilike(libraryTerm.value, like), ilike(libraryTerm.label, like))!)
  }

  const rows = await db
    .select({
      value: libraryTerm.value,
      label: libraryTerm.label,
      useCount: libraryTerm.useCount,
      crops: libraryTerm.crops,
    })
    .from(libraryTerm)
    .where(and(...conditions))
    .orderBy(desc(libraryTerm.useCount), asc(libraryTerm.value))
    .limit(20)

  // Crop-scoped categories (everything but crop/unit/property_key) are ranked with terms
  // used on the current crop first, then the rest — both ordered by use_count as fetched.
  const ranked =
    crop && isCropScoped(category)
      ? [...rows].sort((a, b) => {
          const aMatch = a.crops.split(',').includes(crop) ? 1 : 0
          const bMatch = b.crops.split(',').includes(crop) ? 1 : 0
          return bMatch - aMatch
        })
      : rows

  return NextResponse.json(ranked.map((r) => ({ value: r.value, label: r.label })))
}
