import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { trial, protocol, plot } from '@/lib/db/schema'
import { eq, desc, sql } from 'drizzle-orm'
import { getTrialSnapshot } from '@/lib/trialSnapshot'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getDb()
  const rows = await db
    .select({
      id: trial.id,
      protocolId: trial.protocolId,
      protocolTitle: protocol.title,
      siteName: trial.siteName,
      operator: trial.operator,
      plotRows: trial.plotRows,
      plotCols: trial.plotCols,
      layoutLockedAt: trial.layoutLockedAt,
      createdAt: trial.createdAt,
      plotCount: sql<number>`(
        SELECT count(*) FROM ${plot} WHERE ${plot.trialId} = ${trial.id}
      )`,
    })
    .from(trial)
    .innerJoin(protocol, eq(trial.protocolId, protocol.id))
    .orderBy(desc(trial.updatedAt))

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const db = getDb()
  const body = await req.json().catch(() => ({}))
  const protocolId = Number(body.protocolId)

  const [proto] = await db.select().from(protocol).where(eq(protocol.id, protocolId))
  if (!proto) return NextResponse.json({ error: 'Protocol not found' }, { status: 400 })

  const [row] = await db.insert(trial).values({ protocolId }).returning()
  return NextResponse.json(await getTrialSnapshot(db, row.id))
}
