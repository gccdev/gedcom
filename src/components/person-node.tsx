'use client'

import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import type { Individual } from '@/lib/queries'

interface PersonNodeData {
  individual: Individual
  isSelected?: boolean
}

function formatYears(birthDate: string | null, deathDate: string | null): string {
  const birth = birthDate ? birthDate.split(' ').pop() ?? '?' : '?'
  const death = deathDate ? deathDate.split(' ').pop() ?? '' : ''
  return death ? `${birth}–${death}` : `b. ${birth}`
}

function PersonNode({ data, selected }: { data: PersonNodeData; selected?: boolean }) {
  const { individual } = data
  const bgColor =
    individual.sex === 'M' ? 'bg-blue-50 border-blue-200' :
    individual.sex === 'F' ? 'bg-pink-50 border-pink-200' :
    'bg-slate-50 border-slate-200'
  const selectedRing = selected ? 'ring-2 ring-indigo-500' : ''

  return (
    <div className={`w-[200px] rounded-lg border px-3 py-2 shadow-sm cursor-pointer ${bgColor} ${selectedRing}`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="flex items-center gap-2">
        {individual.photoBlobUrl ? (
          <img
            src={individual.photoBlobUrl}
            alt={individual.fullName}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-500 flex-shrink-0">
            {individual.fullName.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 truncate leading-tight">
            {individual.fullName}
          </p>
          <p className="text-[10px] text-slate-500 leading-tight">
            {formatYears(individual.birthDate, individual.deathDate)}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  )
}

export default memo(PersonNode)
