import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { applicationEvent } from '@/lib/db/schema'
import { and, eq, gt } from 'drizzle-orm'
import { z } from 'zod'
import { rebaseDelta, shiftDate } from '@shared/plan'
import { getTrialSnapshot } from '@/lib/trialSnapshot'
import { logAudit } from '@/lib/audit'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; eventId: string }> }

function badRequest(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

/**
 * Move or cancel an application event. Editing the event header proposes moving the whole
 * event (brief §12); `scope: 'rebase'` additionally delta-shifts every later pending event so
 * the schedule follows from the new date. Completed events are immutable here.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id, eventId } = await ctx.params
  const trialId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return badRequest('Unauthorized', 401)

  const [ev] = await db
    .select()
    .from(applicationEvent)
    .where(and(eq(applicationEvent.id, Number(eventId)), eq(applicationEvent.trialId, trialId)))
  if (!ev) return badRequest('Event not found', 404)

  const body = z
    .object({
      plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      scope: z.enum(['event', 'rebase']).default('event'),
      cancel: z.boolean().optional(),
      reason: z.string().default(''),
      expectedVersion: z.number().int().optional(),
    })
    .safeParse(await req.json().catch(() => ({})))
  if (!body.success) return badRequest(body.error.message)
  const { plannedDate, scope, cancel, reason, expectedVersion } = body.data

  if (ev.executionStatus !== 'pending') {
    return badRequest('This application is completed — its record cannot be rescheduled', 409)
  }
  if (expectedVersion !== undefined && expectedVersion !== ev.version) {
    return badRequest('Event was modified by someone else — reload before saving', 409)
  }

  if (cancel) {
    await db
      .update(applicationEvent)
      .set({
        planningStatus: 'cancelled',
        rescheduleReason: reason,
        version: ev.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(applicationEvent.id, ev.id))
    await logAudit(db, {
      trialId,
      role: 'trial',
      action: 'event.cancel',
      entity: `event:${ev.id}`,
      summary: `Cancelled application ${ev.label} (planned ${ev.plannedDate})`,
      reason,
    })
    return NextResponse.json(await getTrialSnapshot(db, trialId))
  }

  if (!plannedDate) return badRequest('plannedDate is required')
  if (plannedDate === ev.plannedDate) return NextResponse.json(await getTrialSnapshot(db, trialId))

  const delta = rebaseDelta(ev.plannedDate, plannedDate)
  const shifted: { id: number; label: string; from: string; to: string }[] = []

  await db.transaction(async (tx) => {
    await tx
      .update(applicationEvent)
      .set({
        plannedDate,
        rescheduleReason: reason,
        version: ev.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(applicationEvent.id, ev.id))

    if (scope === 'rebase' && delta != null && delta !== 0) {
      const later = await tx
        .select()
        .from(applicationEvent)
        .where(
          and(
            eq(applicationEvent.trialId, trialId),
            eq(applicationEvent.executionStatus, 'pending'),
            eq(applicationEvent.planningStatus, 'planned'),
            gt(applicationEvent.plannedDate, ev.plannedDate)
          )
        )
      for (const l of later) {
        if (l.id === ev.id) continue
        const to = shiftDate(l.plannedDate, delta)
        if (!to) continue
        shifted.push({ id: l.id, label: l.label, from: l.plannedDate, to })
        await tx
          .update(applicationEvent)
          .set({ plannedDate: to, version: l.version + 1, updatedAt: new Date() })
          .where(eq(applicationEvent.id, l.id))
      }
    }
  })

  await logAudit(db, {
    trialId,
    role: 'trial',
    action: scope === 'rebase' ? 'schedule.rebase' : 'event.move',
    entity: `event:${ev.id}`,
    summary:
      scope === 'rebase'
        ? `Moved application ${ev.label} ${ev.plannedDate} → ${plannedDate}; rebased ${shifted.length} later event(s) by ${delta} day(s)`
        : `Moved application ${ev.label} ${ev.plannedDate} → ${plannedDate}`,
    before: { plannedDate: ev.plannedDate },
    after: { plannedDate, shifted },
    reason,
  })

  return NextResponse.json(await getTrialSnapshot(db, trialId))
}
