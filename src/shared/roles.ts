/**
 * Application roles, sourced from Microsoft Entra ID **app roles** (the `roles` claim on the
 * ID token). The Entra app registration must define app roles whose *value* matches these
 * strings and assign them to users/groups; ART reads them from the session and enforces them
 * server-side. No roles are stored in the database — `app_user` is identity only.
 */

export const ROLES = ['preparer', 'research_manager', 'admin'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  preparer: 'Trials Officer / Preparer',
  research_manager: 'Research Manager',
  admin: 'Administrator'
}

/** Narrow an unknown claim array to known roles (unknown values are ignored). */
export function parseRoles(claim: unknown): Role[] {
  if (!Array.isArray(claim)) return []
  return claim.filter((r): r is Role => (ROLES as readonly string[]).includes(r as string))
}

export function hasRole(roles: readonly string[] | undefined, role: Role): boolean {
  return !!roles?.includes(role) || !!roles?.includes('admin')
}
