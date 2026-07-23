import { NextResponse, type NextRequest } from 'next/server'
import { jwtVerify, importSPKI } from 'jose'

const PUBLIC_KEY_PEM = process.env.STRI_AUTH_PUBLIC_KEY!.replace(/\\n/g, '\n')
const APP_NAME = process.env.STRI_APP_NAME!

// Must match APP_TOKEN_TTL_SECONDS in Suite's stri-signing.ts.
const SESSION_MAX_AGE = 60 * 60

let cachedKey: CryptoKey | null = null

async function getPublicKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    cachedKey = await importSPKI(PUBLIC_KEY_PEM, 'EdDSA')
  }
  return cachedKey
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const returnUrl = request.nextUrl.searchParams.get('returnUrl') || '/'

  if (!token) {
    return NextResponse.json({ error: 'No token provided' }, { status: 400 })
  }

  try {
    const key = await getPublicKey()
    const { payload } = await jwtVerify(token, key)

    if (payload.app !== APP_NAME) {
      return NextResponse.json({ error: 'Token not issued for this app' }, { status: 403 })
    }

    // Only ever redirect back into this app — never to an external host.
    let destination: URL
    try {
      destination = new URL(returnUrl, request.nextUrl.origin)
    } catch {
      destination = new URL('/', request.nextUrl.origin)
    }
    if (destination.origin !== request.nextUrl.origin) {
      destination = new URL('/', request.nextUrl.origin)
    }

    const response = NextResponse.redirect(destination)
    response.cookies.set('stri-session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/'
    })

    return response
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }
}
