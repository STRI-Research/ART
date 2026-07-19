import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from './schema'

// Neon's serverless driver over a WebSocket-backed Pool so `db.transaction()` works (the plain
// neon-http driver cannot run multi-statement transactions). `webSocketConstructor` supplies a
// WebSocket in the Node.js runtime (Vercel functions run Node, which lacks a stable global one on
// Node 20); `poolQueryViaFetch` keeps ordinary one-shot queries on fast HTTP while transactions use
// the WebSocket connection.
neonConfig.webSocketConstructor = ws
neonConfig.poolQueryViaFetch = true

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
