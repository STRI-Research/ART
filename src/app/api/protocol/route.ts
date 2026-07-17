import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { protocol, treatment } from '@/lib/db/schema'
import { sql, desc } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
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
    .orderBy(desc(protocol.updatedAt))

  return NextResponse.json(rows)
}

export async function POST() {
  const db = getDb()
  const uid = crypto.randomUUID()
  const [row] = await db
    .insert(protocol)
    .values({ protocolUid: uid })
    .returning()

  return NextResponse.json({
    protocol: row,
    treatments: [],
    applications: [],
    measurementDefs: [],
  })
}
