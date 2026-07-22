import type { Metadata } from 'next'
import { auth, signOut } from '@/auth'
import './globals.css'

export const metadata: Metadata = {
  title: 'ART — Agricultural Research Tool',
  description:
    'Plan, randomize, collect, and analyze field trials. Open-source.',
}

const bypassStripper = `
if(location.search.indexOf('x-vercel-protection-bypass')!==-1){
  var u=new URL(location.href);
  u.searchParams.delete('x-vercel-protection-bypass');
  u.searchParams.delete('x-vercel-set-bypass-cookie');
  history.replaceState({},'',u.toString());
}
`

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: bypassStripper }} />
      </head>
      <body>
        {session?.user ? (
          <div className="app-shell">
            <header className="app-header">
              <a href="/" style={{ textDecoration: 'none' }}>
                <h1>ART</h1>
              </a>
              <nav className="app-nav">
                <a href="/protocol">Protocols</a>
                <a href="/trial">Trials</a>
                <a href="/products">Products</a>
                <a href="/library">Library</a>
              </nav>
              <div className="spacer" />
              <div className="user-info">
                <span className="user-name">{session.user.name ?? session.user.email}</span>
                <form
                  action={async () => {
                    'use server'
                    await signOut({ redirectTo: '/sign-in' })
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
