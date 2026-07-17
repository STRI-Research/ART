import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function requireUser() {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }
  return session.user as { id: string; email: string; name?: string | null }
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}
