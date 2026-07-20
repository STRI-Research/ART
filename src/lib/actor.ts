import { auth } from '@/auth'

export async function getActor(): Promise<string> {
  try {
    const session = await auth()
    return session?.user?.email ?? session?.user?.name ?? 'web'
  } catch {
    return 'web'
  }
}
