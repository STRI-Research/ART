import { getUser } from '@/lib/stri-auth'

export async function getActor(): Promise<string> {
  try {
    const user = await getUser()
    return user?.email || user?.name || 'web'
  } catch {
    return 'web'
  }
}
