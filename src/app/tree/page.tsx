import { Suspense } from 'react'
import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { getFullTreeData } from '@/lib/queries'
import { signIndividual } from '@/lib/media'
import FamilyTree from '@/components/family-tree'
import type { Individual } from '@/lib/queries'

export default async function TreePage() {
  const session = await getSession()
  if (!session) redirect('/auth/signin')

  const defaultFocusId = process.env.DEFAULT_ROOT_PERSON_ID ?? ''
  if (!defaultFocusId) {
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
      <Suspense fallback={<div className="p-8 text-slate-500">Loading tree…</div>}>
        <FamilyTree data={signedData} defaultFocusId={defaultFocusId} />
      </Suspense>
    </div>
  )
}
