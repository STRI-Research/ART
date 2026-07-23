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

/**
 * Data routes must fail with a status code, never a redirect.
 *
 * A fetch() follows redirects transparently, so redirecting an expired XHR to
 * Suite either costs a four-hop round trip per call or — once the Suite session
 * has also lapsed — returns the sign-in HTML, which the caller then tries to
 * parse as JSON. Clients typically have no catch for that, so the UI hangs on a
 * loading state forever instead of reporting an error.
 */
function unauthorized(request: NextRequest): NextResponse {
  const response = NextResponse.json(
    { error: 'Unauthorized', reason: 'stri-session missing or expired' },
    { status: 401 }
  )
  response.cookies.delete('stri-session')
  return response
}

function isDataRequest(request: NextRequest): boolean {
  return (
    request.nextUrl.pathname.startsWith('/api/') ||
    request.headers.get('accept')?.includes('application/json') === true
  )
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const reject = () => (isDataRequest(request) ? unauthorized(request) : redirectToSuite(request))

  const session = request.cookies.get('stri-session')
  if (!session?.value) {
    return reject()
  }

  try {
    const key = await getPublicKey()
    const { payload } = await jwtVerify(session.value, key)

    if (payload.app !== APP_NAME) {
      return reject()
    }

    return NextResponse.next()
  } catch {
    const response = reject()
    response.cookies.delete('stri-session')
    return response
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$).*)']
}
