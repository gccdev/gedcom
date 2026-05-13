import Link from 'next/link'
import { auth, signOut } from '@auth'
import SearchBar from './search-bar'

export default async function Nav() {
  const session = await auth()

  return (
    <nav className="h-14 border-b border-slate-200 bg-white flex items-center px-6 gap-6 shrink-0">
      <Link href="/tree" className="font-semibold text-slate-800 text-sm whitespace-nowrap">
        🌳 Brooke Family Tree
      </Link>

      <div className="flex items-center gap-4">
        <Link href="/tree" className="text-sm text-slate-600 hover:text-slate-900">Tree</Link>
        <Link href="/search" className="text-sm text-slate-600 hover:text-slate-900">Search</Link>
      </div>

      <div className="flex-1" />

      <SearchBar />

      {session?.user && (
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-slate-500 hidden sm:block">{session.user.email}</span>
          <form action={async () => {
            'use server'
            await signOut({ redirectTo: '/auth/signin' })
          }}>
            <button type="submit" className="text-xs text-slate-500 hover:text-slate-800">
              Sign out
            </button>
          </form>
        </div>
      )}
    </nav>
  )
}
