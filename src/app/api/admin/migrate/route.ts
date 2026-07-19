import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Bootstrap schema-sync endpoint. Runs the additive, idempotent DDL needed to bring the database up
 * to the current schema, using the deploy's own DB connection — so a schema change can be applied
 * without a local `npm run db:push`. Every statement is `ADD COLUMN IF NOT EXISTS`, so re-running is
 * a no-op and it can never drop or alter existing data.
 *
 * TEMPORARY: this is unauthenticated bootstrap tooling. Gate or remove it once app-level auth (Entra)
 * exists — it should not remain an open endpoint on a multi-user deployment.
 */
const STATEMENTS: string[] = [
  `ALTER TABLE "protocol" ADD COLUMN IF NOT EXISTS "start_date" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "day_offset" integer NOT NULL DEFAULT 0`,
]

async function run() {
  const db = getDb()
  const applied: string[] = []
  try {
    for (const stmt of STATEMENTS) {
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
