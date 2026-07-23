import { ApplyUploadPage } from '@/components/ApplyUploadPage'

export default async function Page({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  return <ApplyUploadPage documentRef={decodeURIComponent(ref)} />
}
