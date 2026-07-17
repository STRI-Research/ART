import { TrialDetailPage } from '@/components/TrialDetailPage'

type Props = { params: Promise<{ id: string }> }

export default async function TrialPage({ params }: Props) {
  const { id } = await params
  return <TrialDetailPage id={Number(id)} />
}
