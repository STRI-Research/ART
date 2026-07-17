import NextAuth from 'next-auth'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { getDb } from '@/lib/db'
import type { NextAuthConfig } from 'next-auth'

function lazyAdapter() {
  let cached: ReturnType<typeof DrizzleAdapter> | null = null
  return new Proxy({} as ReturnType<typeof DrizzleAdapter>, {
    get(_target, prop) {
      if (!cached) cached = DrizzleAdapter(getDb())
      return (cached as Record<string | symbol, unknown>)[prop]
    },
  })
}

export const authConfig: NextAuthConfig = {
  adapter: lazyAdapter(),
  providers: [
    {
      id: 'email',
      type: 'email',
      name: 'Email',
      from: 'noreply@art.strigroup.com',
      server: {},
      maxAge: 24 * 60 * 60,
      sendVerificationRequest: async ({ identifier, url }) => {
        console.log(`\n  Sign-in link for ${identifier}:\n${url}\n`)
      },
    },
  ],
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id
      return session
    },
  },
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
