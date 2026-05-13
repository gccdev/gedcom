import { auth } from '@auth'
import { redirect } from 'next/navigation'
import { getHourglassData } from '@/lib/queries'
import { signIndividual } from '@/lib/media'
import HourglassTree from '@/components/hourglass-tree'
import type { HourglassData, Individual } from '@/lib/queries'

async function signHourglassData(data: HourglassData): Promise<HourglassData> {
  const [individual, father, mother, pgf, pgm, mgf, mgm, children] = await Promise.all([
    signIndividual(data.individual),
    signIndividual(data.father),
    signIndividual(data.mother),
    signIndividual(data.paternalGrandfather),
    signIndividual(data.paternalGrandmother),
    signIndividual(data.maternalGrandfather),
    signIndividual(data.maternalGrandmother),
    Promise.all(data.children.map(c => signIndividual(c))),
  ])
  return {
    ...data,
    individual: individual!,
    father,
    mother,
    paternalGrandfather: pgf,
    paternalGrandmother: pgm,
    maternalGrandfather: mgf,
    maternalGrandmother: mgm,
    children: children.filter((c): c is Individual => c !== null),
  }
}

export default async function TreePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const session = await auth()
  if (!session) redirect('/auth/signin')

  const { id } = await searchParams
  const personId = id ?? process.env.DEFAULT_ROOT_PERSON_ID ?? ''

  if (!personId) {
    return <div className="p-8 text-slate-500">Set DEFAULT_ROOT_PERSON_ID in .env.local</div>
  }

  const rawData = await getHourglassData(personId)
  if (!rawData) {
    return <div className="p-8 text-slate-500">Person not found: {personId}</div>
  }

  const data = await signHourglassData(rawData)

  return (
    <div className="w-full h-full">
      <HourglassTree initialData={data} />
    </div>
  )
}
