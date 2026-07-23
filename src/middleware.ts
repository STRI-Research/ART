import { NextResponse, type NextRequest } from 'next/server'
import { jwtVerify, importSPKI } from 'jose'

const SUITE_URL = process.env.STRI_SUITE_URL!
const APP_NAME = process.env.STRI_APP_NAME!
const PUBLIC_KEY_PEM = process.env.STRI_AUTH_PUBLIC_KEY!.replace(/\\n/g, '\n')

let cachedKey: CryptoKey | null = null

async function getPublicKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    cachedKey = await importSPKI(PUBLIC_KEY_PEM, 'EdDSA')
  }
  return cachedKey
}

function redirectToSuite(request: NextRequest): NextResponse {
  const loginUrl = new URL('/api/auth/app-login', SUITE_URL)
  loginUrl.searchParams.set('app', APP_NAME)
  loginUrl.searchParams.set('returnUrl', request.url)
  return NextResponse.redirect(loginUrl.toString())
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const session = request.cookies.get('stri-session')
  if (!session?.value) {
    return redirectToSuite(request)
  }

  try {
    const key = await getPublicKey()
    const { payload } = await jwtVerify(session.value, key)

    if (payload.app !== APP_NAME) {
      return redirectToSuite(request)
    }

    return NextResponse.next()
  } catch {
    const response = redirectToSuite(request)
    response.cookies.delete('stri-session')
    return response
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$).*)']
}
