'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
} from 'reactflow'
import type { NodeMouseHandler } from 'reactflow'
import 'reactflow/dist/style.css'
import PersonNode from './person-node'
import PersonPanel from './person-panel'
import { buildHourglassLayout } from '@/lib/tree-layout'
import type { HourglassData, Individual } from '@/lib/queries'

const nodeTypes = { personNode: PersonNode }

interface PanelData {
  individual: Individual
  father: Individual | null
  mother: Individual | null
  spouses: Individual[]
  children: Individual[]
  media: Array<{ id: number; blobUrl: string; mediaType: string; title: string | null }>
}

interface HourglassTreeProps {
  initialData: HourglassData
}

function HourglassTreeInner({ initialData }: HourglassTreeProps) {
  const [currentData, setCurrentData] = useState<HourglassData>(initialData)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [panelData, setPanelData] = useState<PanelData | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    const { nodes: n, edges: e } = buildHourglassLayout(currentData)
    setNodes(n)
    setEdges(e)
  }, [currentData])

  const fetchTree = useCallback(async (id: string) => {
    setLoadingId(id)
    try {
      const res = await fetch(`/api/tree/${id}`)
      if (res.ok) setCurrentData(await res.json())
    } finally {
      setLoadingId(null)
    }
  }, [])

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
    setSelectedId(id)
  }, [])

  const onNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    fetchPanel(node.id)
  }, [fetchPanel])

  const handleNavigate = useCallback((id: string) => {
    setPanelData(null)
    setSelectedId(null)
    fetchTree(id)
    fetchPanel(id)
  }, [fetchTree, fetchPanel])

  const nodesWithSelection = useMemo(
    () => nodes.map(n => ({ ...n, data: { ...n.data, isSelected: n.id === selectedId } })),
    [nodes, selectedId]
  )

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodesWithSelection}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable={false}
      >
        <Background />
        <Controls />
      </ReactFlow>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-auto">
        {currentData.hasGreatGrandparents && currentData.paternalGrandfather && (
          <button
            onClick={() => fetchTree(currentData.paternalGrandfather!.id)}
            className="text-xs bg-white border border-slate-300 rounded-full px-3 py-1 shadow-sm hover:bg-slate-50"
          >
            Show great-grandparents ↑
          </button>
        )}
        {currentData.hasGrandchildren && currentData.children[0] && (
          <button
            onClick={() => fetchTree(currentData.children[0].id)}
            className="text-xs bg-white border border-slate-300 rounded-full px-3 py-1 shadow-sm hover:bg-slate-50"
          >
            Show grandchildren ↓
          </button>
        )}
      </div>

      {loadingId && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white border border-slate-200 rounded-full px-4 py-1 shadow text-xs text-slate-600">
          Loading…
        </div>
      )}

      <PersonPanel
        data={panelData}
        onClose={() => { setPanelData(null); setSelectedId(null) }}
        onNavigate={handleNavigate}
      />
    </div>
  )
}

export default function HourglassTree(props: HourglassTreeProps) {
  return (
    <ReactFlowProvider>
      <HourglassTreeInner {...props} />
    </ReactFlowProvider>
  )
}
