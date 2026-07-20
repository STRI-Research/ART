import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { protocol, application, trial, auditLog } from '@/lib/db/schema'
import { asc, eq, sql } from 'drizzle-orm'
import { Application } from '@shared/types'
import { z } from 'zod'
import { getActor } from '@/lib/actor'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()

  const rows = await db
    .select()
    .from(application)
    .where(eq(application.protocolId, Number(id)))
    .orderBy(asc(application.ordinal))

  return NextResponse.json(rows)
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const protocolId = Number(id)
  const db = getDb()

  const [proto] = await db.select().from(protocol).where(eq(protocol.id, protocolId))
  if (!proto) return badRequest('Protocol not found')

  const [{ count: tc }] = await db.select({ count: sql<number>`count(*)` }).from(trial).where(eq(trial.protocolId, protocolId))
  if (Number(tc) > 0) return NextResponse.json({ error: 'Protocol has trials and cannot be edited' }, { status: 409 })

  const parsed = z.array(Application).safeParse(await req.json())
  if (!parsed.success) return badRequest(parsed.error.message)

  await db.delete(application).where(eq(application.protocolId, protocolId))

  const saved = parsed.data.length
    ? await db
        .insert(application)
        .values(
          parsed.data.map((a, i) => ({
            protocolId,
            ordinal: a.ordinal ?? i,
            timingCode: a.timingCode ?? '',
            targetGrowthStage: a.targetGrowthStage ?? '',
            description: a.description ?? '',
          }))
        )
        .returning()
    : []

  try {
    const actor = await getActor()
    await db.insert(auditLog).values({
      protocolId,
      role: 'protocol',
      actor,
      action: 'applications.replace',
      entity: `protocol:${protocolId}`,
      summary: `Replaced applications for protocol ${protocolId} — ${saved.length} application(s)`,
      detail: JSON.stringify({ count: saved.length }),
    })
  } catch {}

  return NextResponse.json(saved)
}
