import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { measurementHeader } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; headerId: string }> }

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id, headerId } = await ctx.params
  const trialId = Number(id)
  const db = getDb()

  const [existing] = await db
    .select()
    .from(measurementHeader)
    .where(and(eq(measurementHeader.id, Number(headerId)), eq(measurementHeader.trialId, trialId)))
  if (!existing) return NextResponse.json({ error: 'Measurement header not found' }, { status: 400 })

  const body = await req.json()

  const [updated] = await db
    .update(measurementHeader)
    .set({
      measurementDate: body.measurementDate ?? existing.measurementDate,
      assessedBy: body.assessedBy ?? existing.assessedBy,
      growthStage: body.growthStage ?? existing.growthStage,
    })
    .where(eq(measurementHeader.id, existing.id))
    .returning()

  return NextResponse.json(updated)
}
