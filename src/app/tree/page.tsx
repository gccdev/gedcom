import { auth } from '@auth'
import { redirect } from 'next/navigation'
import { getFullTreeData } from '@/lib/queries'
import { signIndividual } from '@/lib/media'
import FullTree from '@/components/full-tree'
import type { Individual } from '@/lib/queries'

export default async function TreePage() {
  const session = await auth()
  if (!session) redirect('/auth/signin')

  const personId = process.env.DEFAULT_ROOT_PERSON_ID ?? ''
  if (!personId) {
    return <div className="p-8 text-slate-500">Set DEFAULT_ROOT_PERSON_ID in .env.local</div>
  }

  const data = await getFullTreeData()

  const signedIndividuals = await Promise.all(data.individuals.map(i => signIndividual(i)))
  const signedData = {
    ...data,
    individuals: signedIndividuals.filter((i): i is Individual => i !== null),
  }

  return (
    <div className="w-full h-full">
      <FullTree data={signedData} rootPersonId={personId} />
    </div>
  )
}
