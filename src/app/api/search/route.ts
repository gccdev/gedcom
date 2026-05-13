import { auth } from '@auth'
import { searchIndividuals } from '@/lib/queries'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const results = await searchIndividuals(q)

  return Response.json(results.map(r => ({
    id: r.id,
    fullName: r.fullName,
    birthDate: r.birthDate,
    birthPlace: r.birthPlace,
    deathDate: r.deathDate,
  })))
}
