import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { trial, property } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { getTrialSnapshot } from '@/lib/trialSnapshot'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()
  const trialId = Number(id)

  const rows = await db.select().from(property).where(eq(property.trialId, trialId))
  return NextResponse.json(rows)
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()
  const trialId = Number(id)

  const [tr] = await db.select().from(trial).where(eq(trial.id, trialId))
  if (!tr) return badRequest('Trial not found')

  const body = await req.json()
  const scope = String(body.scope ?? 'trial')
  const scopeRef = String(body.scopeRef ?? '')
  const props: { key?: string; value?: string }[] = Array.isArray(body.props) ? body.props : []

  await db
    .delete(property)
    .where(and(eq(property.trialId, trialId), eq(property.scope, scope), eq(property.scopeRef, scopeRef)))

  const rows = props
    .filter((p) => (p.key ?? '').trim())
    .map((p) => ({ trialId, scope, scopeRef, key: p.key!, value: p.value ?? '' }))
  if (rows.length > 0) await db.insert(property).values(rows)

  return NextResponse.json(await getTrialSnapshot(db, trialId))
}
