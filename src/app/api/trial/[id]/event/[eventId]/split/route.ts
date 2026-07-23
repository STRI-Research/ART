import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { applicationEvent, eventOccurrence } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { getTrialSnapshot } from '@/lib/trialSnapshot'
import { moveOccurrencesToDate } from '@/lib/planStore'
import { logAudit } from '@/lib/audit'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; eventId: string }> }

function badRequest(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

/** Split selected occurrences out of a pending event onto their own date/event. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id, eventId } = await ctx.params
  const trialId = Number(id)
  const db = getDb()
  const user = await getSessionUser(db)
  if (!user) return badRequest('Unauthorized', 401)

  const body = z
    .object({
      occurrenceIds: z.array(z.number().int()).min(1),
      newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason: z.string().default(''),
    })
    .safeParse(await req.json().catch(() => ({})))
  if (!body.success) return badRequest(body.error.message)

  const [source] = await db
    .select()
    .from(applicationEvent)
    .where(and(eq(applicationEvent.id, Number(eventId)), eq(applicationEvent.trialId, trialId)))
  if (!source) return badRequest('Event not found', 404)
  if (source.executionStatus !== 'pending') {
    return badRequest('Completed applications cannot be split', 409)
  }

  const occ = await db
    .select()
    .from(eventOccurrence)
    .where(
      and(inArray(eventOccurrence.id, body.data.occurrenceIds), eq(eventOccurrence.eventId, source.id))
    )
  if (occ.length !== body.data.occurrenceIds.length) {
    return badRequest('Some occurrences do not belong to this event')
  }
  if (occ.length === 0) return badRequest('Nothing to split')

  let targetLabel = ''
  await db.transaction(async (tx) => {
    const target = await moveOccurrencesToDate(tx, trialId, body.data.occurrenceIds, body.data.newDate, 'split')
    targetLabel = target.label
  })

  await logAudit(db, {
    trialId,
    role: 'trial',
    action: 'event.split',
    entity: `event:${source.id}`,
    summary: `Split ${occ.length} line(s) out of application ${source.label} (${source.plannedDate}) to ${targetLabel} (${body.data.newDate})`,
    detail: { occurrenceIds: body.data.occurrenceIds, newDate: body.data.newDate },
    reason: body.data.reason,
  })

  return NextResponse.json(await getTrialSnapshot(db, trialId))
}
