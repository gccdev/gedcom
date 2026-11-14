'use client'

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { NODE_H, NODE_W, type PersonCardData } from '@/lib/family-layout'
import { formatEvent, formatLifespan, initials } from '@/lib/format'

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

const VIEW_TREE =
  'h-5 px-1.5 rounded text-[10px] font-medium leading-none whitespace-nowrap flex items-center gap-1 ' +
  'text-indigo-700 bg-white/70 border border-indigo-200 hover:bg-indigo-50 hover:border-indigo-400 transition-colors'

/** A three-node hierarchy: one person above, two below. */
export function TreeIcon({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="5.5" y="1.5" width="5" height="4" rx="1" />
      <rect x="1" y="10.5" width="5" height="4" rx="1" />
      <rect x="10" y="10.5" width="5" height="4" rx="1" />
      <path d="M8 5.5v2.5M3.5 10.5V8h9v2.5" />
    </svg>
  )
}

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
    canExpandUp, expandedUp, canExpandDown, expandedDown, childCount, parentCount,
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
        {/*
          Sits apart from the expand buttons: it redraws the tree around this
          person. Offered only when they have parents or children to show;
          otherwise their own tree would be just them and a spouse.
        */}
        {!isFocus && (parentCount > 0 || childCount > 0) && (
          <button
            type="button"
            data-refocus
            aria-label={`View the tree from ${individual.fullName}`}
            title="Redraw the tree around this person"
            className={`${VIEW_TREE} flex-shrink-0`}
          >
            <TreeIcon />
            View tree
          </button>
        )}
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
        {/* Both buttons only open; what they draw stays until Reset or a new focus. */}
        {canExpandDown && !expandedDown && (
          <button
            type="button"
            data-expand-down
            aria-label={`Show spouse and children of ${individual.fullName}`}
            className={`${BUTTON} ${BUTTON_CLOSED}`}
          >
            <span aria-hidden>◂</span>
            {`Children (${childCount})`}
          </button>
        )}

        {canExpandUp && !expandedUp && (
          <button
            type="button"
            data-expand-up
            aria-label={`Show parents of ${individual.fullName}`}
            className={`${BUTTON} ${BUTTON_CLOSED} ml-auto`}
          >
            Parents
            <span aria-hidden>▸</span>
          </button>
        )}
      </div>

      <Handle type="source" id="right" position={Position.Right} style={HIDDEN_HANDLE} />
      <Handle type="source" id="bottom" position={Position.Bottom} style={HIDDEN_HANDLE} />
    </div>
  )
}

export default memo(PersonNode)
