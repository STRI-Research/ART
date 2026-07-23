import { ApplicationPack } from '@/components/ApplicationPack'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>
}) {
  const { id, eventId } = await params
  return <ApplicationPack trialId={Number(id)} eventId={Number(eventId)} />
}
