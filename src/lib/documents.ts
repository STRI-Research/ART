import { createHash } from 'node:crypto'
import { and, desc, eq, inArray } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import {
  applicationDocument,
  applicationEvent,
  appUser,
  notification,
  product,
  treatment,
  treatmentComponent,
  trial,
  protocol,
  plot,
  treatmentMix,
  eventOccurrence,
} from '@/lib/db/schema'
import { buildEventMixes, calculateMix } from '@shared/appcalc'
import {
  CALC_ENGINE_VERSION,
  canonicalJson,
  materialSnapshot,
  documentRef,
  type DocumentSnapshot,
} from '@shared/approval'
import { logAudit } from '@/lib/audit'

type Db = ReturnType<typeof getDb>
type Tx = Pick<Db, 'select' | 'insert' | 'update' | 'delete'>

export function hashSnapshot(snapshot: DocumentSnapshot): string {
  return createHash('sha256').update(canonicalJson(materialSnapshot(snapshot))).digest('hex')
}

/** Build the full document snapshot for an event from live data (calc engine included). */
export async function buildSnapshot(tx: Tx, eventId: number): Promise<DocumentSnapshot | null> {
  const [ev] = await tx.select().from(applicationEvent).where(eq(applicationEvent.id, eventId))
  if (!ev) return null
  const [tr] = await tx.select().from(trial).where(eq(trial.id, ev.trialId))
  if (!tr) return null
  const [proto] = await tx.select().from(protocol).where(eq(protocol.id, tr.protocolId))
  if (!proto) return null

  const treatments = await tx.select().from(treatment).where(eq(treatment.protocolId, proto.id))
  const trtIds = treatments.map((t) => t.id)
  const components = trtIds.length
    ? await tx.select().from(treatmentComponent).where(inArray(treatmentComponent.treatmentId, trtIds))
    : []
  const productIds = [...new Set(components.map((c) => c.productId))]
  const products = productIds.length
    ? await tx.select().from(product).where(inArray(product.id, productIds))
    : []
  const plots = await tx.select().from(plot).where(eq(plot.trialId, tr.id))
  const occurrences = await tx.select().from(eventOccurrence).where(eq(eventOccurrence.eventId, ev.id))
  const mixSettings = await tx.select().from(treatmentMix).where(eq(treatmentMix.eventId, ev.id))

  const plotAreaM2 = (proto.plotWidth || 0) * (proto.plotLength || 0)
  const mixes = buildEventMixes({
    eventId: ev.id,
    occurrences,
    componentById: new Map(components.map((c) => [c.id, c])),
    productById: new Map(
      products.map((p) => [
        p.id,
        {
          id: p.id,
          name: p.name,
          code: p.code,
          mappNumber: p.mappNumber,
          physicalForm: p.physicalForm,
          defaultWaterVolLPerHa: p.defaultWaterVolLPerHa,
        },
      ])
    ),
    treatmentById: new Map(treatments.map((t) => [t.id, t])),
    plots,
    plotAreaM2,
    mixSettings,
  }).map((m) => calculateMix(m))

  return {
    calcEngineVersion: CALC_ENGINE_VERSION,
    trial: {
      id: tr.id,
      siteName: tr.siteName,
      location: tr.location,
      protocolTitle: proto.title,
      protocolUid: proto.protocolUid,
      crop: proto.crop,
      investigator: proto.investigator,
    },
    event: { id: ev.id, label: ev.label, plannedDate: ev.plannedDate },
    plotAreaM2,
    mixes,
    mixSettings: mixSettings.map((m) => ({
      treatmentId: m.treatmentId,
      waterIn: m.waterIn,
      tankMixStatus: m.tankMixStatus,
    })),
  }
}

/** The latest (highest-version) document for an event, if any. */
export async function latestDocument(tx: Tx, eventId: number) {
  const [doc] = await tx
    .select()
    .from(applicationDocument)
    .where(eq(applicationDocument.eventId, eventId))
    .orderBy(desc(applicationDocument.versionNumber))
    .limit(1)
  return doc ?? null
}

export async function notify(
  tx: Tx,
  userId: number | null,
  type: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (userId == null) return
  await tx.insert(notification).values({ userId, type, payloadJson: payload })
}

/**
 * Material-change invalidation (brief §18): recompute the live input hash for an event and, if
 * the latest awaiting/approved document no longer matches, mark it superseded, notify both
 * checkers, and audit. Call after any mutation of planning inputs (dates, occurrences, rates,
 * mixes). Actual/completion details never call this.
 */
export async function invalidateApprovalsIfMaterial(
  db: Db,
  trialId: number,
  eventId: number
): Promise<boolean> {
  const doc = await latestDocument(db, eventId)
  if (!doc || (doc.status !== 'awaiting_approval' && doc.status !== 'approved')) return false

  const snapshot = await buildSnapshot(db, eventId)
  if (!snapshot) return false
  const liveHash = hashSnapshot(snapshot)
  if (liveHash === doc.inputHash) return false

  await db
    .update(applicationDocument)
    .set({ status: 'superseded', supersededAt: new Date() })
    .where(eq(applicationDocument.id, doc.id))

  await notify(db, doc.firstCheckById, 'approval_invalidated', {
    documentRef: doc.documentRef,
    eventId,
  })
  await notify(db, doc.assignedApproverId, 'approval_invalidated', {
    documentRef: doc.documentRef,
    eventId,
  })

  await logAudit(db, {
    trialId,
    role: 'trial',
    action: 'approval.invalidated',
    entity: `document:${doc.id}`,
    summary: `Application changed after ${doc.status === 'approved' ? 'approval' : 'submission'} — ${doc.documentRef} superseded; the revised application requires checking again`,
    documentVersion: doc.versionNumber,
    detail: { previousStatus: doc.status, inputHash: liveHash },
  })
  return true
}

/**
 * Sweep every event in a trial and invalidate approvals whose material inputs no longer match.
 * Planning mutations (moves, rebases, merges, splits, rate overrides, mix settings) call this
 * once after committing; schedule mutations can move occurrences between several events, so a
 * per-trial sweep is the reliable form.
 */
export async function invalidateTrialApprovals(db: Db, trialId: number): Promise<number> {
  const events = await db
    .select({ id: applicationEvent.id })
    .from(applicationEvent)
    .where(eq(applicationEvent.trialId, trialId))
  let invalidated = 0
  for (const ev of events) {
    if (await invalidateApprovalsIfMaterial(db, trialId, ev.id)) invalidated++
  }
  return invalidated
}

/** Create the next document version for an event from live data. */
export async function createDocumentVersion(
  tx: Tx,
  eventId: number,
  trialId: number,
  eventLabel: string,
  createdById: number
) {
  const prev = await latestDocument(tx, eventId)
  const version = (prev?.versionNumber ?? 0) + 1
  const snapshot = await buildSnapshot(tx, eventId)
  if (!snapshot) throw new Error('Could not build document snapshot')
  const [doc] = await tx
    .insert(applicationDocument)
    .values({
      eventId,
      versionNumber: version,
      status: 'draft',
      snapshotJson: snapshot,
      inputHash: hashSnapshot(snapshot),
      documentRef: documentRef(trialId, eventLabel, version),
      createdById,
    })
    .returning()
  return doc
}

/** Resolve an app_user by id (for names on documents/notifications). */
export async function userById(tx: Tx, id: number | null) {
  if (id == null) return null
  const [u] = await tx.select().from(appUser).where(eq(appUser.id, id))
  return u ?? null
}

/** Documents awaiting a given approver. */
export async function documentsAwaiting(tx: Tx, approverId: number) {
  return tx
    .select()
    .from(applicationDocument)
    .where(
      and(
        eq(applicationDocument.assignedApproverId, approverId),
        eq(applicationDocument.status, 'awaiting_approval')
      )
    )
    .orderBy(desc(applicationDocument.createdAt))
}
