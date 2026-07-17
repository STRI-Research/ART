import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ProtocolListPage } from '@/components/ProtocolListPage'

export default async function ProtocolsPage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  return <ProtocolListPage />
}
