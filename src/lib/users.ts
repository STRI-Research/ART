import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import type { getDb } from '@/lib/db'
import { appUser } from '@/lib/db/schema'
import type { Role } from '@shared/roles'

type Db = ReturnType<typeof getDb>

export interface SessionUser {
  /** app_user.id — the FK used by notifications, approvals and evidence records. */
  id: number
  email: string
  name: string
  /** Entra app roles from the session (never trusted from client payloads). */
  roles: Role[]
  oid: string
}

/**
 * Resolve the authenticated user for an API route: reads the server session and lazily
 * upserts the matching `app_user` identity row (identity only — roles are NOT stored, they
 * come from the Entra token on every request). Returns null when unauthenticated.
 */
export async function getSessionUser(db: Db): Promise<SessionUser | null> {
  const session = await auth().catch(() => null)
  const email = session?.user?.email
  if (!email) return null
  const name = session.user.name ?? ''
  const oid = session.user.oid ?? ''
  const roles = session.user.roles ?? []

  const [existing] = await db.select().from(appUser).where(eq(appUser.email, email))
  if (existing) {
    if (existing.name !== name || (oid && existing.entraOid !== oid)) {
      await db
        .update(appUser)
        .set({ name, entraOid: oid || existing.entraOid, updatedAt: new Date() })
        .where(eq(appUser.id, existing.id))
    }
    return { id: existing.id, email, name, roles, oid: oid || existing.entraOid }
  }
  const [created] = await db
    .insert(appUser)
    .values({ email, name, entraOid: oid })
    .onConflictDoUpdate({ target: appUser.email, set: { name, updatedAt: new Date() } })
    .returning()
  return { id: created.id, email, name, roles, oid }
}
