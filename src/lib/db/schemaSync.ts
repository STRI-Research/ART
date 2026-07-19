import { getDb } from './index'
import { sql } from 'drizzle-orm'

/**
 * Additive, idempotent DDL that brings the database up to the current Drizzle schema. Because this
 * project has no migration runner and deploys can't run `db:push`, `ensureSchema()` applies these on
 * the read path so a deploy that adds a column self-heals instead of 500-ing until someone runs a
 * migration. Every statement is `ADD COLUMN IF NOT EXISTS`, so it is safe to run repeatedly and can
 * never drop or alter existing data. `/api/admin/migrate` runs the same list on demand.
 *
 * When you add a column to schema.ts, add its `ADD COLUMN IF NOT EXISTS` here.
 */
export const ADDITIVE_STATEMENTS: string[] = [
  `ALTER TABLE "protocol" ADD COLUMN IF NOT EXISTS "start_date" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "protocol" ADD COLUMN IF NOT EXISTS "client" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "protocol" ADD COLUMN IF NOT EXISTS "contact" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "protocol" ADD COLUMN IF NOT EXISTS "research_manager" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "protocol" ADD COLUMN IF NOT EXISTS "study_director" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "protocol" ADD COLUMN IF NOT EXISTS "trials_officer" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "day_offset" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "measurement_def" ADD COLUMN IF NOT EXISTS "start_offset" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "measurement_def" ADD COLUMN IF NOT EXISTS "interval_days" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "measurement_def" ADD COLUMN IF NOT EXISTS "occurrences" integer NOT NULL DEFAULT 1`,
  `ALTER TABLE "measurement_header" ADD COLUMN IF NOT EXISTS "start_offset" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "measurement_header" ADD COLUMN IF NOT EXISTS "interval_days" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "measurement_header" ADD COLUMN IF NOT EXISTS "occurrences" integer NOT NULL DEFAULT 1`,
]

let ran: Promise<void> | null = null

/** Apply the additive DDL once per server instance (memoised; retries on failure). */
export function ensureSchema(): Promise<void> {
  if (!ran) {
    const db = getDb()
    ran = (async () => {
      for (const stmt of ADDITIVE_STATEMENTS) {
        await db.execute(sql.raw(stmt))
      }
    })().catch((e) => {
      ran = null // allow a later request to retry
      throw e
    })
  }
  return ran
}
