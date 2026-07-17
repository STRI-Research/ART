import type { Metadata } from 'next'
import { SessionProvider } from '@/components/SessionProvider'
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
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
