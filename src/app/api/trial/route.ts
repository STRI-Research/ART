import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { trial, protocol, plot, measurementDef, measurementHeader, auditLog } from '@/lib/db/schema'
import { eq, desc, asc, sql } from 'drizzle-orm'
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

  const defs = await db
    .select()
    .from(measurementDef)
    .where(eq(measurementDef.protocolId, protocolId))
    .orderBy(asc(measurementDef.ordinal))

  if (defs.length > 0) {
    await db.insert(measurementHeader).values(
      defs.map((d) => ({
        trialId: row.id,
        partMeasured: d.partMeasured,
        measurementType: d.measurementType,
        measurementUnit: d.measurementUnit,
        applicationRef: d.applicationRef,
        daysAfter: d.daysAfter,
        timing: d.timing,
        description: d.description,
        ordinal: d.ordinal,
        origin: 'core',
        locked: true,
        analyze: d.analyze,
        subsamples: d.subsamples,
        formula: d.formula,
      }))
    )
  }

  const actor = req.headers.get('x-vercel-user-email') ?? 'web'
  try {
    await db.insert(auditLog).values({
      trialId: row.id,
      protocolId,
      role: 'trial',
      actor,
      action: 'trial.create',
      entity: `trial:${row.id}`,
      summary: `Created trial from protocol "${proto.title}" (UID ${proto.protocolUid} v${proto.protocolVersion})`,
      detail: JSON.stringify({ protocolId, protocolUid: proto.protocolUid, protocolVersion: proto.protocolVersion, coreHeaders: defs.length }),
    })
  } catch {}

  return NextResponse.json(await getTrialSnapshot(db, row.id))
}
