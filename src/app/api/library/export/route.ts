import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { libraryTerm } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'
import type { LibraryExport } from '@shared/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getDb()
  const terms = await db
    .select()
    .from(libraryTerm)
    .orderBy(desc(libraryTerm.useCount))

  const payload: LibraryExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    terms: terms.map((t) => ({
      category: t.category as LibraryExport['terms'][number]['category'],
      value: t.value,
      label: t.label,
      crops: t.crops ? t.crops.split(',').filter(Boolean) : [],
    })),
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="library.artlib"',
    },
  })
}
