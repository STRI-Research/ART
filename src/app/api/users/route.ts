import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { appUser } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

/**
 * Known users (identity rows accreted at sign-in) — used to pick the Research-Manager approver
 * when submitting an application. Role enforcement happens server-side at approval time from
 * the approver's own Entra token, not from this list.
 */
export async function GET() {
  const db = getDb()
  const me = await getSessionUser(db)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await db
    .select({ id: appUser.id, name: appUser.name, email: appUser.email })
    .from(appUser)
    .where(eq(appUser.active, true))
    .orderBy(asc(appUser.name))
  return NextResponse.json({ me: { id: me.id, roles: me.roles }, users: rows })
}
