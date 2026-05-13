import { auth } from '@auth'
import { redirect } from 'next/navigation'
import { searchIndividuals } from '@/lib/queries'
import Link from 'next/link'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await auth()
  if (!session) redirect('/auth/signin')

  const { q } = await searchParams
  const query = q ?? ''
  const results = query ? await searchIndividuals(query) : []

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-800 mb-6">Search</h1>
      <form method="GET" action="/search" className="mb-6">
        <div className="flex gap-2">
          <input
            name="q"
            defaultValue={query}
            placeholder="Search by name…"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            autoFocus
          />
          <button
            type="submit"
            className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700"
          >
            Search
          </button>
        </div>
      </form>

      {results.length === 0 && query && (
        <p className="text-slate-500 text-sm">No results for "{query}"</p>
      )}

      <ul className="space-y-2">
        {results.map(r => (
          <li key={r.id}>
            <Link
              href={`/tree?id=${r.id}`}
              className="block bg-white border border-slate-200 rounded-lg px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition"
            >
              <p className="font-medium text-slate-800 text-sm">{r.fullName}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {r.birthDate && `b. ${r.birthDate}`}
                {r.birthPlace && ` · ${r.birthPlace}`}
                {r.deathDate && ` · d. ${r.deathDate}`}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
