import NextAuth from 'next-auth'
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id'
import { parseRoles, type Role } from '@shared/roles'

/**
 * Roles come from Entra **app roles**: the app registration defines roles whose value is
 * `preparer` / `research_manager` / `admin`, assigns them to users/groups, and they arrive in
 * the ID token's `roles` claim. We surface roles + the `oid` (durable Entra object id) on the
 * session; server code must always read identity from the session, never from client payloads.
 *
 * NOTE: this module is bundled into the middleware (edge runtime) via `src/middleware.ts`, so
 * it must stay free of Node-only imports (no DB). The app_user upsert lives in
 * `src/lib/users.ts` and runs inside node-runtime API routes.
 */

declare module 'next-auth' {
  interface Session {
    user: {
      name?: string | null
      email?: string | null
      image?: string | null
      /** Entra app roles (empty when none are assigned). */
      roles: Role[]
      /** Entra object id. */
      oid?: string
    }
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`,
    }),
  ],
  pages: {
    signIn: '/sign-in',
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user
    },
    jwt({ token, profile }) {
      // `profile` is the decoded ID token on sign-in only; persist the claims we need.
      if (profile) {
        const p = profile as { oid?: string; roles?: unknown }
        if (p.oid) token.oid = p.oid
        token.roles = parseRoles(p.roles)
      }
      return token
    },
    session({ session, token }) {
      session.user.roles = parseRoles(token.roles)
      if (typeof token.oid === 'string') session.user.oid = token.oid
      return session
    },
  },
})
