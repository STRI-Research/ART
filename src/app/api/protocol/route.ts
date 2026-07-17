import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { protocol, treatment } from '@/lib/db/schema'
import { eq, sql, desc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { unauthorized } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const db = getDb()
  const rows = await db
    .select({
      id: protocol.id,
      title: protocol.title,
      crop: protocol.crop,
      design: protocol.design,
      investigator: protocol.investigator,
      season: protocol.season,
      createdAt: protocol.createdAt,
      treatmentCount: sql<number>`(
        SELECT count(*) FROM ${treatment} WHERE ${treatment.protocolId} = ${protocol.id}
      )`,
    })
    .from(protocol)
    .where(eq(protocol.userId, session.user.id))
    .orderBy(desc(protocol.updatedAt))

  return NextResponse.json(rows)
}

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const db = getDb()
  const uid = crypto.randomUUID()
  const [row] = await db
    .insert(protocol)
    .values({
      userId: session.user.id,
      protocolUid: uid,
    })
    .returning()

  return NextResponse.json({
    protocol: row,
    treatments: [],
    applications: [],
    measurementDefs: [],
  })
}
