'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import ReactFlow, {
  Background,
  Controls,
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
import { NODE_H, NODE_W, buildPedigreeLayout, resolveFocusId } from '@/lib/pedigree-layout'
import type { FullTreeData, Individual } from '@/lib/queries'

const nodeTypes = { personCard: PersonNode }

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

interface PedigreeTreeProps {
  data: FullTreeData
  defaultFocusId: string
}

function PedigreeTreeInner({ data, defaultFocusId }: PedigreeTreeProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [panelData, setPanelData] = useState<PanelData | null>(null)
  const { setCenter } = useReactFlow()

  const searchParams = useSearchParams()
  const index = useMemo(() => buildTreeIndex(data), [data])
  const focusId = resolveFocusId(index, searchParams.get('focus'), defaultFocusId)

  const layout = useMemo(() => buildPedigreeLayout(index, focusId), [index, focusId])

  useEffect(() => {
    setNodes(layout.nodes)
    setEdges(layout.edges)

    const focusNode = layout.nodes.find(n => n.id === focusId)
    if (focusNode) {
      setCenter(
        focusNode.position.x + NODE_W / 2,
        focusNode.position.y + NODE_H / 2,
        { zoom: 1, duration: 400 },
      )
    }
  }, [layout, focusId, setNodes, setEdges, setCenter])

  const setFocus = useCallback((id: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('focus', id)
    // Shallow routing: updates useSearchParams without re-running the server component.
    window.history.pushState(null, '', `?${params.toString()}`)
  }, [searchParams])

  const fetchPanel = useCallback(async (id: string) => {
    const res = await fetch(`/api/person/${id}`)
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
  }, [])

  const onNodeClick: NodeMouseHandler = useCallback(
    (event, node) => {
      if ((event.target as HTMLElement).closest('[data-detail-button]')) {
        fetchPanel(node.id)
        return
      }
      if (node.id !== focusId) setFocus(node.id)
    },
    [focusId, fetchPanel, setFocus],
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
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable={false}
      >
        <Background />
        <Controls />
      </ReactFlow>

      <PersonPanel
        data={panelData}
        onClose={() => setPanelData(null)}
        onNavigate={(id) => {
          setPanelData(null)
          setFocus(id)
        }}
      />
    </div>
  )
}

export default function PedigreeTree(props: PedigreeTreeProps) {
  return (
    <ReactFlowProvider>
      <PedigreeTreeInner {...props} />
    </ReactFlowProvider>
  )
}
