import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from './schema'

let _db: NeonHttpDatabase<typeof schema> | null = null

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!_db) {
    const url = process.env.POSTGRES_URL
    if (!url) {
      throw new Error(
        'POSTGRES_URL is not set. Run `vercel env pull` to populate .env.local.'
      )
    }
    const sql = neon(url)
    _db = drizzle(sql, { schema })
  }
  return _db
}
