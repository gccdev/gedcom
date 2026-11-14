'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import ReactFlow, {
  Background,
  Controls,
  Panel,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow'
import type { NodeMouseHandler } from 'reactflow'
import 'reactflow/dist/style.css'
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

  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges)
  const [panelData, setPanelData] = useState<PanelData | null>(null)
  const focusPerson = index.byId.get(focusId)
  const { setCenter, fitView } = useReactFlow()

  // Sync the layout into React Flow. Ease to the focus only when the root
  // changed (a new focus or an explicit re-centre); expansion leaves the
  // viewport alone. The first render is handled by the fitView prop.
  const lastRoot = useRef<string | null>(null)
  const fitAfterSync = useRef(false)
  useEffect(() => {
    setNodes(layout.nodes)
    setEdges(layout.edges)

    // A toolbar action can add many cards at once, so bring them all into view
    // once React Flow has taken the new nodes.
    if (fitAfterSync.current) {
      fitAfterSync.current = false
      const timer = window.setTimeout(() => fitView({ ...FIT_VIEW_OPTIONS, duration: 400 }), 50)
      lastRoot.current = `${focusId}:${rootVersion}`
      return () => window.clearTimeout(timer)
    }

    const root = `${focusId}:${rootVersion}`
    if (lastRoot.current === null) {
      lastRoot.current = root
      return
    }
    if (lastRoot.current === root) return
    lastRoot.current = root

    const focusNode = layout.nodes.find(n => n.id === focusId)
    if (focusNode) {
      setCenter(
        focusNode.position.x + NODE_W / 2,
        focusNode.position.y + NODE_H / 2,
        { zoom: 1, duration: 400 },
      )
    }
  }, [layout, focusId, rootVersion, setNodes, setEdges, setCenter, fitView])

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

  const toggle = useCallback((side: 'up' | 'down', id: string) => {
    setExpansionState({ focusId, expansion: toggleExpansion(expansion, side, id) })
  }, [focusId, expansion])

  const expandAll = useCallback((side: 'up' | 'down') => {
    fitAfterSync.current = true
    const next = side === 'up'
      ? expandAllAncestors(index, focusId, expansion)
      : expandAllDescendants(index, focusId, expansion)
    setExpansionState({ focusId, expansion: next })
  }, [index, focusId, expansion])

  const resetView = useCallback(() => {
    fitAfterSync.current = true
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
        toggle('up', node.id)
      } else if (target.closest('[data-expand-down]')) {
        toggle('down', node.id)
      } else if (target.closest('[data-refocus]')) {
        recentre(node.id)
      } else {
        fetchPanel(node.id)
      }
    },
    [toggle, recentre, fetchPanel],
  )

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
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
        onNavigate={recentre}
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
