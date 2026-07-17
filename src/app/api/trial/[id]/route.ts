import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { trial } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getTrialSnapshot } from '@/lib/trialSnapshot'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()

  const snapshot = await getTrialSnapshot(db, Number(id))
  if (!snapshot) return badRequest('Trial not found')

  return NextResponse.json(snapshot)
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()

  const [tr] = await db.select().from(trial).where(eq(trial.id, Number(id)))
  if (!tr) return badRequest('Trial not found')

  await db.delete(trial).where(eq(trial.id, tr.id))
  return NextResponse.json({ ok: true })
}
