import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/stri-auth'
import './globals.css'

export const metadata: Metadata = {
  title: 'ART — Agricultural Research Tool',
  description: 'Plan, randomize, collect, and analyze field trials. Open-source.'
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()

  return (
    <html lang="en">
      <body>
        {user ? (
          <div className="app-shell">
            <header className="app-header">
              <a href="/" style={{ textDecoration: 'none' }}>
                <h1>ART</h1>
              </a>
              <nav className="app-nav">
                <a href="/protocol">Protocols</a>
                <a href="/trial">Trials</a>
                <a href="/products">Products</a>
                <a href="/approvals">Approvals</a>
                <a href="/library">Library</a>
              </nav>
              <div className="spacer" />
              <div className="user-info">
                <span className="user-name">{user.name || user.email}</span>
                <form
                  action={async () => {
                    'use server'
                    // Clearing only ART's cookie would bounce straight back through
                    // the broker and sign the user in again, so end the Suite
                    // session too — that is where the identity actually lives.
                    const store = await cookies()
                    store.delete('stri-session')
                    redirect(`${process.env.STRI_SUITE_URL}/api/auth/signout`)
                  }}
                >
                  <button type="submit" className="sign-out-btn">
                    Sign out
                  </button>
                </form>
              </div>
            </header>
            <main className="app-main">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  )
}
