import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { WelcomePage } from '@/components/WelcomePage'

export default async function Home() {
  const session = await auth()

  if (session?.user) {
    redirect('/protocol')
  }

  return <WelcomePage />
}
