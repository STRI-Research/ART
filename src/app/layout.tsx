import type { Metadata } from 'next'
import Link from 'next/link'
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: bypassStripper }} />
      </head>
      <body>
        <div className="app-shell">
          <header className="app-header">
            <Link href="/" style={{ textDecoration: 'none' }}>
              <h1>ART</h1>
            </Link>
            <nav className="app-nav">
              <Link href="/protocol">Protocols</Link>
              <Link href="/trial">Trials</Link>
              <Link href="/library">Library</Link>
            </nav>
            <div className="spacer" />
          </header>
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  )
}
