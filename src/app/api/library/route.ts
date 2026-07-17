import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { libraryTerm } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getDb()
  const terms = await db
    .select()
    .from(libraryTerm)
    .orderBy(desc(libraryTerm.useCount))

  return NextResponse.json(
    terms.map((t) => ({
      id: t.id,
      category: t.category,
      value: t.value,
      label: t.label,
      useCount: t.useCount,
      crops: t.crops ? t.crops.split(',').filter(Boolean) : [],
    }))
  )
}

/** Delete a library term by id, passed as a query param (`?id=123`). The REST-ish
 *  `/api/library/[id]` route covers the same operation for the API client. */
export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }
  const db = getDb()
  await db.delete(libraryTerm).where(eq(libraryTerm.id, id))
  return NextResponse.json({ ok: true })
}
