import { eq } from 'drizzle-orm'
import { getUser } from '@/lib/stri-auth'
import type { getDb } from '@/lib/db'
import { appUser } from '@/lib/db/schema'
import type { Role } from '@shared/roles'

type Db = ReturnType<typeof getDb>

export interface SessionUser {
  /** app_user.id — the FK used by notifications, approvals and evidence records. */
  id: number
  email: string
  name: string
  /** ART application roles, derived from the STRI Suite role (see mapSuiteRole). */
  roles: Role[]
  oid: string
}

/**
 * Maps a STRI Suite role onto ART's application roles.
 *
 * This feature was written against Microsoft Entra app roles, which ART read
 * from the ID token's `roles` claim. Authentication now goes through the STRI
 * Suite broker, whose token carries a single coarse role (ADMIN | CREATOR |
 * USER) and no Entra claim, so the mapping has to be explicit.
 *
 * Deliberately conservative: only a Suite ADMIN receives `admin`. `hasRole()`
 * treats `admin` as satisfying every check, so a generous mapping here would
 * silently hand out document-approval rights. Everyone else is a `preparer`.
 *
 * Consequence today: nobody is a `research_manager` unless they are a Suite
 * ADMIN, so approvals are under-granted rather than over-granted. The lasting
 * fix is for ART to own these roles in its own table and look them up by
 * email — the pattern STRI Planner uses for people/roles — rather than
 * inferring them from a platform-level role.
 */
function mapSuiteRole(suiteRole: string | undefined): Role[] {
  return suiteRole === 'ADMIN' ? ['admin'] : ['preparer']
}

/**
 * Resolve the authenticated user for an API route: reads the Suite session and lazily
 * upserts the matching `app_user` identity row (identity only — roles are NOT stored,
 * they are derived per request). Returns null when unauthenticated.
 */
export async function getSessionUser(db: Db): Promise<SessionUser | null> {
  const user = await getUser().catch(() => null)
  const email = user?.email
  if (!email) return null
  const name = user.name ?? ''
  const roles = mapSuiteRole(user.role)

  const [existing] = await db.select().from(appUser).where(eq(appUser.email, email))
  if (existing) {
    if (existing.name !== name) {
      await db
        .update(appUser)
        .set({ name, updatedAt: new Date() })
        .where(eq(appUser.id, existing.id))
    }
    // Suite's token does not carry the Entra object id, so preserve whatever
    // the row already has rather than blanking it.
    return { id: existing.id, email, name, roles, oid: existing.entraOid ?? '' }
  }
  const [created] = await db
    .insert(appUser)
    .values({ email, name, entraOid: '' })
    .onConflictDoUpdate({ target: appUser.email, set: { name, updatedAt: new Date() } })
    .returning()
  return { id: created.id, email, name, roles, oid: '' }
}
