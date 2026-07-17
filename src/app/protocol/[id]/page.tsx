import { ProtocolDetailPage } from '@/components/ProtocolDetailPage'

type Props = { params: Promise<{ id: string }> }

export default async function ProtocolPage({ params }: Props) {
  const { id } = await params
  return <ProtocolDetailPage id={Number(id)} />
}
