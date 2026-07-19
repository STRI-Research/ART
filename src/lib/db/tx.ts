import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from './schema'

// Interactive multi-statement transactions need the WebSocket-backed serverless driver (the neon-http
// driver in ./index.ts cannot do them). In a serverless runtime a WebSocket Pool must NOT be cached
// across invocations — the socket goes stale and the next call fails with "Connection terminated
// unexpectedly". So we open a FRESH pool per transaction and close it in `finally`, with a small retry
// for Neon's scale-to-zero cold start (the first connection can drop while compute wakes).
neonConfig.webSocketConstructor = ws

type TxDb = NeonDatabase<typeof schema>
export type Tx = Parameters<Parameters<TxDb['transaction']>[0]>[0]

const TRANSIENT = /terminated|connection|ECONNRESET|socket|fetch failed|timeout/i

export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const url = process.env.POSTGRES_URL
  if (!url) throw new Error('POSTGRES_URL is not set.')

  const maxAttempts = 3
  for (let attempt = 1; ; attempt++) {
    const pool = new Pool({ connectionString: url })
    try {
      return await drizzle(pool, { schema }).transaction(fn)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (attempt < maxAttempts && TRANSIENT.test(msg)) continue // transient — retry with a fresh pool
      throw e
    } finally {
      await pool.end().catch(() => {})
    }
  }
}
