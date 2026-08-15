'use client'

import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import { NODE_H, NODE_W, type PersonCardData } from '@/lib/pedigree-layout'

function formatYears(birthDate: string | null, deathDate: string | null): string {
  const birth = birthDate ? birthDate.split(' ').pop() ?? '?' : '?'
  const death = deathDate ? deathDate.split(' ').pop() ?? '' : ''
  return death ? `${birth}–${death}` : `b. ${birth}`
}

function initials(fullName: string): string {
  return fullName.split(' ').map(word => word[0]).slice(0, 2).join('')
}

const HIDDEN_HANDLE = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 'none',
} as const

function PersonNode({ data }: { data: PersonCardData }) {
  const { individual, role, isFocus, hasMore, spouseCount } = data

  const tint =
    individual.sex === 'M' ? 'bg-sky-50 border-sky-200' :
    individual.sex === 'F' ? 'bg-rose-50 border-rose-200' :
    'bg-slate-50 border-slate-200'
  const focusRing = isFocus ? 'ring-2 ring-indigo-500 shadow-md' : 'shadow-sm'

  return (
    <div
      className={`relative flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:shadow-md transition-shadow ${tint} ${focusRing}`}
      style={{ width: NODE_W, height: NODE_H }}
    >
      <Handle type="target" id="left" position={Position.Left} style={HIDDEN_HANDLE} />
      <Handle type="target" id="top" position={Position.Top} style={HIDDEN_HANDLE} />

      {individual.photoBlobUrl ? (
        <img
          src={individual.photoBlobUrl}
          alt={individual.fullName}
          className="w-12 h-12 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-500 flex-shrink-0">
          {initials(individual.fullName)}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800 truncate leading-tight">
          {individual.fullName}
        </p>
        <p className="text-xs text-slate-500 leading-tight">
          {formatYears(individual.birthDate, individual.deathDate)}
        </p>
        {role === 'spouse' && spouseCount > 1 && (
          <p className="text-[10px] text-slate-400 leading-tight">+{spouseCount - 1} more</p>
        )}
      </div>

      <button
        type="button"
        data-detail-button
        aria-label={`View details for ${individual.fullName}`}
        className="flex-shrink-0 text-slate-400 hover:text-indigo-600 px-1 text-lg leading-none"
      >
        ›
      </button>

      {hasMore && (
        <span
          aria-hidden
          className="absolute -right-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg leading-none"
        >
          ›
        </span>
      )}

      <Handle type="source" id="right" position={Position.Right} style={HIDDEN_HANDLE} />
      <Handle type="source" id="bottom" position={Position.Bottom} style={HIDDEN_HANDLE} />
    </div>
  )
}

export default memo(PersonNode)
