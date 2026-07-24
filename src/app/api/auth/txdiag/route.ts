import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { sql } from 'drizzle-orm'

// TEMPORARY diagnostic — verifies db.transaction() works in the Vercel runtime
// after externalizing ws. Lives under /api/auth so it bypasses auth middleware.
// Guarded by a secret and REMOVED once the fix is confirmed.
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('k') !== 'txcheck-9f3a') {
    return NextResponse.json({ error: 'nope' }, { status: 404 })
  }
  const db = getDb()
  const result: Record<string, string> = {}
  try {
    const r = await db.execute(sql`select count(*)::int n from protocol`)
    result.simple = 'ok:' + (r.rows as { n: number }[])[0].n
  } catch (e) {
    result.simple = 'FAIL:' + (e as Error).message.split('\n')[0]
  }
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select 1`)
      await tx.execute(sql`select 2`)
    })
    result.transaction = 'ok'
  } catch (e) {
    result.transaction = 'FAIL:' + (e as Error).message.split('\n')[0]
  }
  return NextResponse.json(result)
}
