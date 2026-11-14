'use client'

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { NODE_H, NODE_W, type PersonCardData } from '@/lib/family-layout'
import { formatEvent, formatLifespan } from '@/lib/format'

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

const BUTTON =
  'h-6 px-2 rounded border text-[11px] font-medium leading-none whitespace-nowrap ' +
  'flex items-center gap-1 transition-colors'
const BUTTON_CLOSED = 'border-slate-300 bg-white text-slate-700 hover:border-indigo-400 hover:text-indigo-700'
const BUTTON_OPEN = 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'

function EventLine({ label, text }: { label: string; text: string }) {
  return (
    <p className="text-[11px] text-slate-600 leading-4 truncate" title={text || undefined}>
      <span className="font-semibold text-slate-400">{label}</span> {text || '—'}
    </p>
  )
}

/*
  The buttons carry no onClick by design: the `data-expand-up`,
  `data-expand-down` and `data-refocus` attributes are the contract. Clicks
  bubble to React Flow's node wrapper, where family-tree.tsx's onNodeClick
  recovers intent via closest('[data-expand-up]') etc. Any other click on the
  card opens the detail panel. The visually hidden `data-detail-button` exists
  for keyboard/AT users: React Flow's node wrapper handles Enter/Space itself
  (for selection) rather than calling onNodeClick, so a real focusable button
  is needed to activate the panel via keyboard — its click falls through the
  same onNodeClick branch as any other non-button click.
*/
function PersonNode({ data }: { data: PersonCardData }) {
  const {
    individual, isFocus, isSpouse, spouseCount,
    canExpandUp, expandedUp, canExpandDown, expandedDown, childCount,
  } = data

  const tint =
    individual.sex === 'M' ? 'bg-sky-50 border-sky-200' :
    individual.sex === 'F' ? 'bg-rose-50 border-rose-200' :
    'bg-slate-50 border-slate-200'
  const focusRing = isFocus ? 'ring-2 ring-indigo-500 shadow-md' : 'shadow-sm'
  const lifespan = formatLifespan(individual.birthDate, individual.deathDate)

  return (
    <div
      className={`relative flex flex-col rounded-md border px-2.5 py-2 cursor-pointer hover:shadow-md transition-shadow ${tint} ${focusRing}`}
      style={{ width: NODE_W, height: NODE_H }}
    >
      <Handle type="target" id="left" position={Position.Left} style={HIDDEN_HANDLE} />
      <Handle type="target" id="top" position={Position.Top} style={HIDDEN_HANDLE} />

      <div className="flex items-start gap-2.5">
        {individual.photoBlobUrl ? (
          <img
            src={individual.photoBlobUrl}
            alt={individual.fullName}
            className="w-11 h-11 rounded object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-11 h-11 rounded bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-500 flex-shrink-0">
            {initials(individual.fullName)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-800 leading-[1.2] line-clamp-2" title={individual.fullName}>
            {individual.fullName}
          </p>
          <p className="text-[11px] text-slate-500 leading-4">
            {lifespan || 'Dates unknown'}
            {isSpouse && <span className="text-slate-400"> · spouse{spouseCount > 1 ? ` (1 of ${spouseCount})` : ''}</span>}
          </p>
        </div>
      </div>

      <div className="mt-1.5">
        <EventLine label="Born" text={formatEvent(individual.birthDate, individual.birthPlace)} />
        <EventLine label="Died" text={formatEvent(individual.deathDate, individual.deathPlace)} />
      </div>

      <button
        type="button"
        data-detail-button
        aria-label={`View details for ${individual.fullName}`}
        className="sr-only"
      />

      <div className="mt-auto flex items-center gap-1.5">
        {canExpandDown && (
          <button
            type="button"
            data-expand-down
            aria-expanded={expandedDown}
            aria-label={`${expandedDown ? 'Hide' : 'Show'} spouse and children of ${individual.fullName}`}
            className={`${BUTTON} ${expandedDown ? BUTTON_OPEN : BUTTON_CLOSED}`}
          >
            <span aria-hidden>{expandedDown ? '−' : '◂'}</span>
            {expandedDown ? 'Hide children' : `Children (${childCount})`}
          </button>
        )}

        {!isFocus && (
          <button
            type="button"
            data-refocus
            aria-label={`Centre the tree on ${individual.fullName}`}
            title="Centre the tree on this person to see their own family"
            className={`${BUTTON} ${BUTTON_CLOSED} mx-auto`}
          >
            Focus
          </button>
        )}

        {canExpandUp && (
          <button
            type="button"
            data-expand-up
            aria-expanded={expandedUp}
            aria-label={`${expandedUp ? 'Hide' : 'Show'} parents of ${individual.fullName}`}
            className={`${BUTTON} ${expandedUp ? BUTTON_OPEN : BUTTON_CLOSED} ml-auto`}
          >
            {expandedUp ? 'Hide parents' : 'Parents'}
            <span aria-hidden>{expandedUp ? '−' : '▸'}</span>
          </button>
        )}
      </div>

      <Handle type="source" id="right" position={Position.Right} style={HIDDEN_HANDLE} />
      <Handle type="source" id="bottom" position={Position.Bottom} style={HIDDEN_HANDLE} />
    </div>
  )
}

export default memo(PersonNode)
