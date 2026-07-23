import { cookies } from 'next/headers'
import { jwtVerify, importSPKI } from 'jose'

const PUBLIC_KEY_PEM = process.env.STRI_AUTH_PUBLIC_KEY!.replace(/\\n/g, '\n')
const APP_NAME = process.env.STRI_APP_NAME!

let cachedKey: CryptoKey | null = null

async function getPublicKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    cachedKey = await importSPKI(PUBLIC_KEY_PEM, 'EdDSA')
  }
  return cachedKey
}

export interface StriUser {
  id: string
  email: string
  name: string
  role: string
}

export async function getUser(): Promise<StriUser | null> {
  const cookieStore = await cookies()
  const session = cookieStore.get('stri-session')
  if (!session?.value) return null

  try {
    const key = await getPublicKey()
    const { payload } = await jwtVerify(session.value, key)

    if (payload.app !== APP_NAME) return null

    return {
      id: payload.sub as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string
    }
  } catch {
    return null
  }
}
