import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from './schema'
import { getDb } from './index'

/**
 * Runs a set of write statements for the callers that were grouped as a "transaction".
 *
 * Interactive WebSocket transactions (drizzle-orm/neon-serverless) do NOT work in this serverless
 * environment — establishing the socket hangs until the function times out. So these operations run
 * over the reliable neon-http driver instead.
 *
 * CAVEAT: neon-http sends each statement as its own HTTP request, so this is sequential and NOT
 * atomic. It is safe for create-only flows (a failed run leaves a deletable partial record). For the
 * destructive delete-then-insert flows, atomicity should be restored with a single-request batch
 * (`db.batch([...])`, Neon's non-interactive HTTP transaction) — tracked as follow-up.
 */
export type Tx = NeonHttpDatabase<typeof schema>

export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return fn(getDb())
}
