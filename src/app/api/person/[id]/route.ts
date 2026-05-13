import { auth } from '@auth'
import { getPersonDetail, Individual } from '@/lib/queries'
import { signBlobUrl } from '@/lib/media'

async function signIndividual(ind: Individual | null): Promise<Individual | null> {
  if (!ind || !ind.photoBlobUrl) return ind
  return { ...ind, photoBlobUrl: await signBlobUrl(ind.photoBlobUrl) }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const detail = await getPersonDetail(id)
  if (!detail) return new Response('Not found', { status: 404 })

  const signedMedia = await Promise.all(
    detail.media.map(async m => ({ ...m, blobUrl: await signBlobUrl(m.blobUrl) }))
  )

  return Response.json({
    ...detail,
    father: await signIndividual(detail.father),
    mother: await signIndividual(detail.mother),
    spouses: await Promise.all(detail.spouses.map(signIndividual)),
    children: await Promise.all(detail.children.map(signIndividual)),
    media: signedMedia,
  })
}
