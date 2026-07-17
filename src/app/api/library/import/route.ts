import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { libraryTerm } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import type { LibraryExport } from '@shared/types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body: LibraryExport = await req.json()

  if (!body || body.version !== 1 || !Array.isArray(body.terms)) {
    return NextResponse.json(
      { error: 'Invalid library file format' },
      { status: 400 }
    )
  }

  const db = getDb()
  let imported = 0
  let merged = 0

  for (const term of body.terms) {
    if (!term.category || !term.value) continue

    const incomingCrops = Array.isArray(term.crops) ? term.crops.filter(Boolean) : []

    // Check if a term with the same (category, value) already exists
    const [existing] = await db
      .select()
      .from(libraryTerm)
      .where(
        and(
          eq(libraryTerm.category, term.category),
          eq(libraryTerm.value, term.value)
        )
      )

    if (existing) {
      // Merge: fill empty label, union crops, bump useCount
      const existingCrops = existing.crops ? existing.crops.split(',').filter(Boolean) : []
      const unionCrops = [...new Set([...existingCrops, ...incomingCrops])]

      await db
        .update(libraryTerm)
        .set({
          label: existing.label || term.label || '',
          crops: unionCrops.join(','),
          useCount: existing.useCount + 1,
        })
        .where(eq(libraryTerm.id, existing.id))

      merged++
    } else {
      // Insert new
      await db.insert(libraryTerm).values({
        category: term.category,
        value: term.value,
        label: term.label || '',
        useCount: 0,
        crops: incomingCrops.join(','),
      })
      imported++
    }
  }

  return NextResponse.json({ imported, merged })
}
