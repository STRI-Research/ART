import { eq } from 'drizzle-orm'
import { getUser } from '@/lib/stri-auth'
import type { getDb } from '@/lib/db'
import { appUser } from '@/lib/db/schema'
import { parseRoles, type Role } from '@shared/roles'

type Db = ReturnType<typeof getDb>

export interface SessionUser {
  /** app_user.id — the FK used by notifications, approvals and evidence records. */
  id: number
  email: string
  name: string
  /** ART application roles, owned in app_user.role and looked up by email. */
  roles: Role[]
  oid: string
}

/**
 * Resolve the authenticated user for an API route.
 *
 * STRI Suite provides *authentication* (who you are); ART provides
 * *authorization* via `app_user.role`, looked up by email. This replaced the
 * old Entra app-role claims, which the Suite broker does not carry. A new user
 * is created as `preparer`; an ART admin promotes them from there.
 *
 * Returns null when unauthenticated.
 */
export async function getSessionUser(db: Db): Promise<SessionUser | null> {
  const user = await getUser().catch(() => null)
  const email = user?.email
  if (!email) return null
  const name = user.name ?? ''

  const [existing] = await db.select().from(appUser).where(eq(appUser.email, email))
  if (existing) {
    if (existing.name !== name) {
      await db
        .update(appUser)
        .set({ name, updatedAt: new Date() })
        .where(eq(appUser.id, existing.id))
    }
    return {
      id: existing.id,
      email,
      name,
      roles: parseRoles([existing.role]),
      oid: existing.entraOid ?? '',
    }
  }
  const [created] = await db
    .insert(appUser)
    .values({ email, name, entraOid: '' })
    .onConflictDoUpdate({ target: appUser.email, set: { name, updatedAt: new Date() } })
    .returning()
  return { id: created.id, email, name, roles: parseRoles([created.role]), oid: '' }
}
