import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from './schema'

// The WebSocket-backed neon-serverless driver (rather than neon-http) so that
// db.transaction() works — schedule generation, approval and invalidation flows
// must be atomic. Node runtimes need an explicit WebSocket constructor.
neonConfig.webSocketConstructor = ws

// Route ordinary (non-transactional) queries over HTTP fetch instead of the
// WebSocket. Without this every query goes through `ws`, which fails in Vercel's
// runtime with "TypeError: b.mask is not a function" — the masking helper does
// not survive bundling — so all read endpoints returned 500.
//
// Transactions still open a real WebSocket session; those paths need the Node
// runtime (`export const runtime = 'nodejs'`) on their route.
neonConfig.poolQueryViaFetch = true

let _db: NeonDatabase<typeof schema> | null = null

export function getDb(): NeonDatabase<typeof schema> {
  if (!_db) {
    const url = process.env.POSTGRES_URL
    if (!url) {
      throw new Error('POSTGRES_URL is not set. Run `vercel env pull` to populate .env.local.')
    }
    const pool = new Pool({ connectionString: url })
    _db = drizzle(pool, { schema })
  }
  return _db
}
