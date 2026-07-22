import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from './schema'

// The WebSocket-backed neon-serverless driver (rather than neon-http) so that
// db.transaction() works — schedule generation, approval and invalidation flows
// must be atomic. Node runtimes need an explicit WebSocket constructor.
neonConfig.webSocketConstructor = ws

let _db: NeonDatabase<typeof schema> | null = null

export function getDb(): NeonDatabase<typeof schema> {
  if (!_db) {
    const url = process.env.POSTGRES_URL
    if (!url) {
      throw new Error(
        'POSTGRES_URL is not set. Run `vercel env pull` to populate .env.local.'
      )
    }
    const pool = new Pool({ connectionString: url })
    _db = drizzle(pool, { schema })
  }
  return _db
}
