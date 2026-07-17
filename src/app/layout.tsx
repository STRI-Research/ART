import type { Metadata } from 'next'
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
            <a href="/" style={{ textDecoration: 'none' }}>
              <h1>ART</h1>
            </a>
            <nav className="app-nav">
              <a href="/protocol">Protocols</a>
              <a href="/trial">Trials</a>
              <a href="/library">Library</a>
            </nav>
            <div className="spacer" />
          </header>
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  )
}
