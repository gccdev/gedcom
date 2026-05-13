'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface SearchResult {
  id: string
  fullName: string
  birthDate: string | null
  birthPlace: string | null
  deathDate: string | null
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const debouncedQuery = useDebounce(query, 300)
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([])
      setOpen(false)
      return
    }
    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then(r => r.json())
      .then((data: SearchResult[]) => {
        setResults(data)
        setOpen(data.length > 0)
      })
      .catch(() => {/* silently ignore network errors */})
  }, [debouncedQuery])

  function select(id: string) {
    setQuery('')
    setResults([])
    setOpen(false)
    router.push(`/tree?id=${id}`)
  }

  return (
    <div ref={containerRef} className="relative w-64">
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search family members…"
        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
      {open && results.length > 0 && (
        <ul className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
          {results.map(r => (
            <li key={r.id}>
              <button
                onMouseDown={() => select(r.id)}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
              >
                <span className="font-medium text-slate-800">{r.fullName}</span>
                <span className="text-slate-400 text-xs ml-2">
                  {r.birthDate?.split(' ').pop()}
                  {r.birthPlace && ` · ${r.birthPlace.split(',')[0]}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
