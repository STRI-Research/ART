import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { measurementHeader, auditLog } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getActor } from '@/lib/actor'

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

  try {
    const actor = await getActor()
    const label = existing.description || existing.measurementType || `measurement ${existing.ordinal}`
    const fields = ['measurementDate','assessedBy','growthStage']
    const changed = fields.filter((f) => body[f] !== undefined && body[f] !== (existing as Record<string, unknown>)[f])
    await db.insert(auditLog).values({
      trialId,
      role: 'trial',
      actor,
      action: 'measurement.metadata.edit',
      entity: `measurement_header:${existing.id}`,
      summary: `Edited metadata for "${label}" — changed ${changed.length ? changed.join(', ') : 'fields'}`,
      detail: JSON.stringify({ headerId: existing.id, changed }),
    })
  } catch {}

  return NextResponse.json(updated)
}
