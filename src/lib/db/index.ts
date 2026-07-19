import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from './schema'

// Ordinary queries use the neon-http driver: each query is a single stateless HTTP request, which is
// safe to cache across serverless invocations (no long-lived connection to go stale). Multi-statement
// transactions are NOT available here — use `withTransaction` (src/lib/db/tx.ts) for those.
let _db: NeonHttpDatabase<typeof schema> | null = null

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!_db) {
    const url = process.env.POSTGRES_URL
    if (!url) {
      throw new Error(
        'POSTGRES_URL is not set. Run `vercel env pull` to populate .env.local.'
      )
    }
    _db = drizzle(neon(url), { schema })
  }
  return _db
}
