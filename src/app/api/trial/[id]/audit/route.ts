import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { auditLog } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()

  const entries = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.trialId, Number(id)))
    .orderBy(desc(auditLog.ts))

  return NextResponse.json(
    entries.map((e) => ({
      id: e.id,
      ts: e.ts?.toISOString() ?? '',
      actor: e.actor,
      role: e.role,
      action: e.action,
      entity: e.entity,
      summary: e.summary,
      detail: JSON.parse(e.detail || '{}'),
    }))
  )
}
