import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { applicationEvent, eventOccurrence } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getTrialSnapshot } from '@/lib/trialSnapshot'
import { logAudit } from '@/lib/audit'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; eventId: string }> }

function badRequest(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

/**
 * Record that an application event happened: the actual date/times, operator and sprayer.
 * Marks the event completed (planned date remains visible; the actual is stored separately)
 * and its occurrences applied. Fuller execution capture (weather, checks, deviations,
 * evidence) lands in Phase 6 — this establishes completed-event protection and DAT dates now.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
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
  if (ev.planningStatus === 'cancelled') return badRequest('Event is cancelled', 409)
  if (ev.executionStatus !== 'pending') {
    return badRequest('Application is already completed', 409)
  }

  const body = z
    .object({
      actualDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      actualStartTime: z.string().default(''),
      actualEndTime: z.string().default(''),
      operator: z.string().default(''),
      sprayer: z.string().default(''),
      completionNotes: z.string().default(''),
    })
    .safeParse(await req.json().catch(() => ({})))
  if (!body.success) return badRequest(body.error.message)
  const c = body.data

  await db.transaction(async (tx) => {
    await tx
      .update(applicationEvent)
      .set({
        actualDate: c.actualDate,
        actualStartTime: c.actualStartTime,
        actualEndTime: c.actualEndTime,
        operator: c.operator,
        sprayer: c.sprayer,
        completionNotes: c.completionNotes,
        executionStatus: 'completed',
        evidenceStatus: 'outstanding',
        version: ev.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(applicationEvent.id, ev.id))
    await tx
      .update(eventOccurrence)
      .set({ status: 'applied' })
      .where(and(eq(eventOccurrence.eventId, ev.id), eq(eventOccurrence.status, 'planned')))
  })

  await logAudit(db, {
    trialId,
    role: 'trial',
    action: 'application.complete',
    entity: `event:${ev.id}`,
    summary: `Recorded application ${ev.label} as completed on ${c.actualDate} (planned ${ev.plannedDate})`,
    after: {
      actualDate: c.actualDate,
      operator: c.operator,
      sprayer: c.sprayer,
    },
  })

  return NextResponse.json(await getTrialSnapshot(db, trialId))
}
