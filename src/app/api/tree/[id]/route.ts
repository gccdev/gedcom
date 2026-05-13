import { auth } from '@auth'
import { getHourglassData } from '@/lib/queries'
import { signIndividual } from '@/lib/media'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const data = await getHourglassData(id)
  if (!data) return new Response('Not found', { status: 404 })

  const signed = {
    individual: await signIndividual(data.individual),
    father: await signIndividual(data.father),
    mother: await signIndividual(data.mother),
    paternalGrandfather: await signIndividual(data.paternalGrandfather),
    paternalGrandmother: await signIndividual(data.paternalGrandmother),
    maternalGrandfather: await signIndividual(data.maternalGrandfather),
    maternalGrandmother: await signIndividual(data.maternalGrandmother),
    children: await Promise.all(data.children.map(signIndividual)),
    hasGreatGrandparents: data.hasGreatGrandparents,
    hasGrandchildren: data.hasGrandchildren,
  }

  return Response.json(signed)
}
