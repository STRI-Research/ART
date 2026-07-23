import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { applicationEvent, eventOccurrence } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getTrialSnapshot } from '@/lib/trialSnapshot'
import { deleteEmptyPendingEvents } from '@/lib/planStore'
import { logAudit } from '@/lib/audit'
import { invalidateTrialApprovals } from '@/lib/documents'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; eventId: string }> }

function badRequest(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

/**
 * Merge this pending event's occurrences into another pending event (nearby dates that should
 * be sprayed together). The source event is removed once emptied. Tank-mix compatibility is
 * NOT assumed — the client shows the confirmation warning; the mix-level compatibility record
 * lands with treatment mixes in Phase 3.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id, eventId } = await ctx.params
  const trialId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return badRequest('Unauthorized', 401)

  const body = z
    .object({ intoEventId: z.number().int(), reason: z.string().default('') })
    .safeParse(await req.json().catch(() => ({})))
  if (!body.success) return badRequest(body.error.message)

  const [source] = await db
    .select()
    .from(applicationEvent)
    .where(and(eq(applicationEvent.id, Number(eventId)), eq(applicationEvent.trialId, trialId)))
  const [target] = await db
    .select()
    .from(applicationEvent)
    .where(and(eq(applicationEvent.id, body.data.intoEventId), eq(applicationEvent.trialId, trialId)))
  if (!source || !target) return badRequest('Event not found', 404)
  if (source.id === target.id) return badRequest('Cannot merge an event into itself')
  if (source.executionStatus !== 'pending' || target.executionStatus !== 'pending') {
    return badRequest('Completed applications cannot be merged', 409)
  }
  if (source.planningStatus === 'cancelled' || target.planningStatus === 'cancelled') {
    return badRequest('Cancelled events cannot be merged', 409)
  }

  await db.transaction(async (tx) => {
    await tx
      .update(eventOccurrence)
      .set({ eventId: target.id })
      .where(eq(eventOccurrence.eventId, source.id))
    await deleteEmptyPendingEvents(tx, trialId)
    await tx
      .update(applicationEvent)
      .set({ version: target.version + 1, updatedAt: new Date() })
      .where(eq(applicationEvent.id, target.id))
  })

  await logAudit(db, {
    trialId,
    role: 'trial',
    action: 'events.merge',
    entity: `event:${target.id}`,
    summary: `Merged application ${source.label} (${source.plannedDate}) into ${target.label} (${target.plannedDate}) — confirm tank-mix compatibility`,
    before: { sourceEvent: source.label, sourceDate: source.plannedDate },
    after: { targetEvent: target.label, targetDate: target.plannedDate },
    reason: body.data.reason,
  })

  await invalidateTrialApprovals(db, trialId)
  return NextResponse.json(await getTrialSnapshot(db, trialId))
}
