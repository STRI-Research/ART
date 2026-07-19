import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { ADDITIVE_STATEMENTS } from '@/lib/db/schemaSync'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * On-demand schema-sync endpoint. Runs the same additive, idempotent DDL as `ensureSchema()` on the
 * deploy's own DB connection — a manual trigger for the self-healing that also runs on the read path.
 *
 * TEMPORARY: unauthenticated bootstrap tooling. Gate or remove once app-level auth (Entra) exists.
 */
async function run() {
  const db = getDb()
  const applied: string[] = []
  try {
    for (const stmt of ADDITIVE_STATEMENTS) {
      await db.execute(sql.raw(stmt))
      applied.push(stmt)
    }
    return NextResponse.json({ ok: true, applied })
  } catch (e) {
    return NextResponse.json(
      { ok: false, applied, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}

export const GET = run
export const POST = run
