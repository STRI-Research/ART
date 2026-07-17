import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { protocol, application } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import { Application } from '@shared/types'
import { z } from 'zod'

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

  return NextResponse.json(saved)
}
