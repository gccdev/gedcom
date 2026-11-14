'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import type { NodeMouseHandler } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import PersonNode from './person-node'
import PersonPanel from './person-panel'
import { buildTreeIndex } from '@/lib/tree-index'
import {
  NODE_H, NODE_W, buildFamilyLayout, defaultExpansion, expandAllAncestors, expandAllDescendants,
  resolveFocusId, toggleExpansion,
} from '@/lib/family-layout'
import type { Expansion } from '@/lib/family-layout'
import type { FullTreeData, Individual } from '@/lib/queries'

const nodeTypes = { personCard: PersonNode }
const FIT_VIEW_OPTIONS = { maxZoom: 1, padding: 0.1 }

const TOOLBAR_BUTTON =
  'h-8 px-3 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-700 shadow-sm ' +
  'hover:border-indigo-400 hover:text-indigo-700'

interface PanelMedia {
  id: number
  blobUrl: string
  mediaType: string
  title: string | null
}

interface PanelData {
  individual: Individual
  father: Individual | null
  mother: Individual | null
  spouses: Individual[]
  children: Individual[]
  media: PanelMedia[]
}

interface FamilyTreeProps {
  data: FullTreeData
  defaultFocusId: string
}

/** Expansion state is keyed by focus so a re-root falls back to the default without a stale render. */
interface ExpansionState {
  focusId: string
  expansion: Expansion
}

function FamilyTreeInner({ data, defaultFocusId }: FamilyTreeProps) {
  const searchParams = useSearchParams()
  const index = useMemo(() => buildTreeIndex(data), [data])
  // `id` is the legacy parameter, kept so older /tree?id= bookmarks still resolve.
  const focusId = resolveFocusId(index, searchParams.get('focus') ?? searchParams.get('id'), defaultFocusId)

  const [expansionState, setExpansionState] = useState<ExpansionState | null>(null)
  const [rootVersion, setRootVersion] = useState(0)
  const initialExpansion = useMemo(() => defaultExpansion(index, focusId), [index, focusId])
  const expansion = expansionState?.focusId === focusId ? expansionState.expansion : initialExpansion

  const layout = useMemo(() => buildFamilyLayout(index, focusId, expansion), [index, focusId, expansion])

  const [panelData, setPanelData] = useState<PanelData | null>(null)
  const focusPerson = index.byId.get(focusId)
  const { setCenter, fitView, getZoom } = useReactFlow()

  // The layout is handed to React Flow as-is: cards are not draggable and carry
  // their own size, so there is no node state to keep. This effect only moves
  // the viewport. A toolbar action refits everything; a new root (a new focus
  // or an explicit re-centre) eases to the focus card; opening someone's
  // children eases to that person's card at the current zoom, because the new
  // cards shift the layout around them; opening parents leaves the viewport
  // alone. The first render is handled by the fitView prop.
  const lastRoot = useRef<string | null>(null)
  const fitAfterLayout = useRef(false)
  const centreAfterLayout = useRef<string | null>(null)
  useEffect(() => {
    const root = `${focusId}:${rootVersion}`
    const rootChanged = lastRoot.current !== null && lastRoot.current !== root
    lastRoot.current = root

    if (fitAfterLayout.current) {
      fitAfterLayout.current = false
      fitView({ ...FIT_VIEW_OPTIONS, duration: 400 })
      return
    }

    const centreId = centreAfterLayout.current
    centreAfterLayout.current = null
    const centreNode = centreId ? layout.nodes.find(n => n.id === centreId) : undefined
    if (centreNode) {
      setCenter(
        centreNode.position.x + NODE_W / 2,
        centreNode.position.y + NODE_H / 2,
        { zoom: getZoom(), duration: 400 },
      )
      return
    }
    if (!rootChanged) return

    const focusNode = layout.nodes.find(n => n.id === focusId)
    if (focusNode) {
      setCenter(
        focusNode.position.x + NODE_W / 2,
        focusNode.position.y + NODE_H / 2,
        { zoom: 1, duration: 400 },
      )
    }
  }, [layout, focusId, rootVersion, setCenter, fitView, getZoom])

  const setFocus = useCallback((id: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('focus', id)
    // Shallow routing: updates useSearchParams without re-running the server component.
    window.history.pushState(null, '', `?${params.toString()}`)
  }, [searchParams])

  // One panel request in flight at a time. Closing the panel or re-rooting aborts
  // it too, so a late response cannot reopen a panel the user just dismissed.
  const panelRequest = useRef<AbortController | null>(null)
  const abortPanel = useCallback(() => {
    panelRequest.current?.abort()
    panelRequest.current = null
  }, [])

  /**
   * Re-root on `id`, resetting expansion. A new focus re-centres via the
   * effect when the URL changes; re-centring on the current focus bumps
   * rootVersion instead so the effect still fires exactly once.
   */
  const recentre = useCallback((id: string) => {
    abortPanel()
    setPanelData(null)
    setExpansionState(null)
    if (id === focusId) setRootVersion(v => v + 1)
    else setFocus(id)
  }, [focusId, setFocus, abortPanel])

  const expand = useCallback((side: 'up' | 'down', id: string) => {
    // Expand-only: no control hides parents or children again.
    if (expansion[side].has(id)) return
    if (side === 'down') centreAfterLayout.current = id
    setExpansionState({ focusId, expansion: toggleExpansion(expansion, side, id) })
  }, [focusId, expansion])

  const expandAll = useCallback((side: 'up' | 'down') => {
    fitAfterLayout.current = true
    const next = side === 'up'
      ? expandAllAncestors(index, focusId, expansion)
      : expandAllDescendants(index, focusId, expansion)
    setExpansionState({ focusId, expansion: next })
  }, [index, focusId, expansion])

  const resetView = useCallback(() => {
    fitAfterLayout.current = true
    setExpansionState({ focusId, expansion: defaultExpansion(index, focusId) })
  }, [index, focusId])

  const fetchPanel = useCallback(async (id: string) => {
    abortPanel()
    const controller = new AbortController()
    panelRequest.current = controller
    try {
      const res = await fetch(`/api/person/${id}`, { signal: controller.signal })
      if (!res.ok) return
      const detail = await res.json()
      setPanelData({
        individual: detail,
        father: detail.father,
        mother: detail.mother,
        spouses: detail.spouses,
        children: detail.children,
        media: detail.media,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error(err)
    }
  }, [abortPanel])

  const onNodeClick: NodeMouseHandler = useCallback(
    (event, node) => {
      const target = event.target as HTMLElement
      if (target.closest('[data-expand-up]')) {
        expand('up', node.id)
      } else if (target.closest('[data-expand-down]')) {
        expand('down', node.id)
      } else if (target.closest('[data-refocus]')) {
        recentre(node.id)
      } else {
        fetchPanel(node.id)
      }
    },
    [expand, recentre, fetchPanel],
  )

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={layout.nodes}
        edges={layout.edges}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.05}
        maxZoom={2}
        nodesDraggable={false}
      >
        <Background />
        <Controls />
        <Panel position="top-left">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white/95 p-2 shadow-sm">
            <span className="px-1 text-xs text-slate-500">
              {focusPerson?.fullName ?? 'Tree'} · {layout.nodes.length} shown
            </span>
            <button type="button" className={TOOLBAR_BUTTON} onClick={() => expandAll('up')}>
              Show all ancestors
            </button>
            <button type="button" className={TOOLBAR_BUTTON} onClick={() => expandAll('down')}>
              Show all descendants
            </button>
            <button type="button" className={TOOLBAR_BUTTON} onClick={resetView}>
              Reset
            </button>
          </div>
        </Panel>
      </ReactFlow>

      <PersonPanel
        data={panelData}
        onClose={() => { abortPanel(); setPanelData(null) }}
        onSelect={fetchPanel}
        onCentre={recentre}
      />
    </div>
  )
}

export default function FamilyTree(props: FamilyTreeProps) {
  return (
    <ReactFlowProvider>
      <FamilyTreeInner {...props} />
    </ReactFlowProvider>
  )
}
