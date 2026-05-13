'use client'

import { useRouter } from 'next/navigation'
import type { Individual } from '@/lib/queries'

interface PanelMedia {
  id: number
  blobUrl: string
  mediaType: string
  title: string | null
}

interface PersonPanelData {
  individual: Individual
  father: Individual | null
  mother: Individual | null
  spouses: Individual[]
  children: Individual[]
  media: PanelMedia[]
}

interface PersonPanelProps {
  data: PersonPanelData | null
  onClose: () => void
  onNavigate: (id: string) => void
}

function FamilyLink({ person, label, onNavigate }: {
  person: Individual | null
  label: string
  onNavigate: (id: string) => void
}) {
  if (!person) return null
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs text-slate-500 w-16 shrink-0">{label}</span>
      <button
        onClick={() => onNavigate(person.id)}
        className="text-xs text-indigo-600 hover:underline truncate text-right"
      >
        {person.fullName}
      </button>
    </div>
  )
}

export default function PersonPanel({ data, onClose, onNavigate }: PersonPanelProps) {
  const router = useRouter()
  if (!data) return null
  const { individual, father, mother, spouses, children, media } = data

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-xl border-l border-slate-200 z-20 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800 text-sm truncate">{individual.fullName}</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none ml-2">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <div>
          {individual.birthDate && (
            <p className="text-xs text-slate-600">
              <span className="font-medium">Born</span> {individual.birthDate}
              {individual.birthPlace && ` · ${individual.birthPlace}`}
            </p>
          )}
          {individual.deathDate && (
            <p className="text-xs text-slate-600 mt-0.5">
              <span className="font-medium">Died</span> {individual.deathDate}
              {individual.deathPlace && ` · ${individual.deathPlace}`}
            </p>
          )}
        </div>

        {(father || mother || spouses.length > 0 || children.length > 0) && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Family</p>
            <FamilyLink person={father} label="Father" onNavigate={onNavigate} />
            <FamilyLink person={mother} label="Mother" onNavigate={onNavigate} />
            {spouses.map(s => <FamilyLink key={s.id} person={s} label="Spouse" onNavigate={onNavigate} />)}
            {children.slice(0, 5).map(c => <FamilyLink key={c.id} person={c} label="Child" onNavigate={onNavigate} />)}
            {children.length > 5 && (
              <p className="text-xs text-slate-400 text-right">+{children.length - 5} more</p>
            )}
          </div>
        )}

        {media.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Photos & Documents ({media.length})
            </p>
            <div className="flex gap-2">
              {media.slice(0, 3).map(m => (
                <img
                  key={m.id}
                  src={m.blobUrl}
                  alt={m.title ?? ''}
                  className="w-20 h-20 rounded object-cover border border-slate-200"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-slate-100">
        <button
          onClick={() => router.push(`/person/${individual.id}`)}
          className="w-full text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          View full profile →
        </button>
      </div>
    </div>
  )
}
