import { NextResponse, type NextRequest } from 'next/server'
import { put } from '@vercel/blob'
import { getDb } from '@/lib/db'
import { applicationEvent, evidenceFile } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { latestDocument } from '@/lib/documents'
import { logAudit } from '@/lib/audit'
import { getSessionUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; eventId: string }> }

function badRequest(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

const MAX_BYTES = 15 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf']

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id, eventId } = await ctx.params
  const db = getDb()
  const rows = await db
    .select()
    .from(evidenceFile)
    .where(eq(evidenceFile.eventId, Number(eventId)))
    .orderBy(desc(evidenceFile.uploadedAt))
  void id
  return NextResponse.json(rows)
}

/**
 * Upload the signed paper application record (photo/scan) for a completed event. Stored in
 * Vercel Blob (unguessable URL); the current file, if any, is kept and marked replaced so the
 * evidence history is never lost. Marks the event's evidence as uploaded and audits.
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
  if (ev.executionStatus === 'pending') {
    return badRequest('Record the application as completed before uploading signed evidence', 409)
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return badRequest('No file provided (multipart field "file")')
  if (file.size === 0) return badRequest('File is empty')
  if (file.size > MAX_BYTES) return badRequest('File exceeds the 15 MB limit')
  if (!ALLOWED_TYPES.includes(file.type)) {
    return badRequest(`Unsupported file type ${file.type || '(unknown)'} — upload a photo or PDF`)
  }

  const doc = await latestDocument(db, ev.id)
  const key = `evidence/trial-${trialId}/event-${ev.label}/${file.name}`
  let blob: { url: string; pathname: string }
  try {
    blob = await put(key, file, { access: 'public', addRandomSuffix: true })
  } catch (e) {
    return badRequest(
      `Blob storage upload failed — is BLOB_READ_WRITE_TOKEN configured? (${e instanceof Error ? e.message : e})`,
      502
    )
  }

  // Preserve history: mark the current live file (if any) as replaced by the new row.
  const [current] = await db
    .select()
    .from(evidenceFile)
    .where(and(eq(evidenceFile.eventId, ev.id), eq(evidenceFile.replacedById, 0)))
    .orderBy(desc(evidenceFile.uploadedAt))
    .limit(1)

  const [row] = await db
    .insert(evidenceFile)
    .values({
      eventId: ev.id,
      documentId: doc?.id ?? null,
      blobKey: blob.pathname,
      blobUrl: blob.url,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      evidenceType: 'signed_application',
      uploadedById: user.id,
      replacedById: 0,
    })
    .returning()

  if (current) {
    await db.update(evidenceFile).set({ replacedById: row.id }).where(eq(evidenceFile.id, current.id))
  }

  await db
    .update(applicationEvent)
    .set({ evidenceStatus: 'uploaded', updatedAt: new Date() })
    .where(eq(applicationEvent.id, ev.id))

  await logAudit(db, {
    trialId,
    role: 'trial',
    action: current ? 'evidence.replace' : 'evidence.upload',
    entity: `event:${ev.id}`,
    summary: `${current ? 'Replaced' : 'Uploaded'} signed application evidence for application ${ev.label} (${file.name}, ${(file.size / 1024).toFixed(0)} KB) by ${user.name || user.email}`,
    documentVersion: doc?.versionNumber,
    detail: { fileName: file.name, mimeType: file.type, sizeBytes: file.size, replaced: current?.id },
  })

  return NextResponse.json(row)
}
