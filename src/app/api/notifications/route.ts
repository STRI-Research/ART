import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { notification } from '@/lib/db/schema'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

/** The signed-in user's notifications, unread first, newest first. */
export async function GET() {
  const db = getDb()
  const me = await getSessionUser(db)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await db
    .select()
    .from(notification)
    .where(eq(notification.userId, me.id))
    .orderBy(desc(notification.createdAt))
    .limit(100)
  return NextResponse.json(rows)
}

/** Mark notifications read (ids: [...] or all: true). */
export async function POST(req: NextRequest) {
  const db = getDb()
  const me = await getSessionUser(db)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = z
    .object({ ids: z.array(z.number().int()).optional(), all: z.boolean().optional() })
    .safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: body.error.message }, { status: 400 })

  if (body.data.all) {
    await db
      .update(notification)
      .set({ readAt: new Date() })
      .where(and(eq(notification.userId, me.id), isNull(notification.readAt)))
  } else if (body.data.ids?.length) {
    await db
      .update(notification)
      .set({ readAt: new Date() })
      .where(and(eq(notification.userId, me.id), inArray(notification.id, body.data.ids)))
  }
  return NextResponse.json({ ok: true })
}
