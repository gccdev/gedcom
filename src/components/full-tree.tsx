'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow'
import type { NodeMouseHandler } from 'reactflow'
import 'reactflow/dist/style.css'
import PersonNode from './person-node'
import FamilyConnectorNode from './family-connector-node'
import PersonPanel from './person-panel'
import { buildFullTreeLayout, NODE_W, NODE_H } from '@/lib/full-tree-layout'
import type { FullTreeData, Individual } from '@/lib/queries'

const nodeTypes = {
  personNode: PersonNode,
  familyConnector: FamilyConnectorNode,
}

interface PanelData {
  individual: Individual
  father: Individual | null
  mother: Individual | null
  spouses: Individual[]
  children: Individual[]
  media: Array<{ id: number; blobUrl: string; mediaType: string; title: string | null }>
}

interface FullTreeProps {
  data: FullTreeData
  rootPersonId: string
}

function FullTreeInner({ data, rootPersonId }: FullTreeProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [panelData, setPanelData] = useState<PanelData | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { setCenter } = useReactFlow()
  const initialised = useRef(false)

  useEffect(() => {
    const { nodes: n, edges: e } = buildFullTreeLayout(data, rootPersonId)
    setNodes(n)
    setEdges(e)

    if (!initialised.current) {
      initialised.current = true
      const rootNode = n.find(nd => nd.id === rootPersonId)
      if (rootNode) {
        setTimeout(() => {
          setCenter(
            rootNode.position.x + NODE_W / 2,
            rootNode.position.y + NODE_H / 2,
            { zoom: 1.2, duration: 0 },
          )
        }, 50)
      }
    }
  }, [data, rootPersonId])

  const nodesWithSelection = useMemo(
    () => nodes.map(n => ({ ...n, data: { ...n.data, isSelected: n.id === selectedId } })),
    [nodes, selectedId],
  )

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

  const onNodeClick: NodeMouseHandler = useCallback(
    (_evt, node) => {
      if (node.type === 'familyConnector') return
      fetchPanel(node.id)
    },
    [fetchPanel],
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
        minZoom={0.05}
        maxZoom={2}
        nodesDraggable={false}
      >
        <Background />
        <Controls />
      </ReactFlow>

      <PersonPanel
        data={panelData}
        onClose={() => { setPanelData(null); setSelectedId(null) }}
        onNavigate={(id) => {
          setPanelData(null)
          setSelectedId(null)
          fetchPanel(id)
        }}
      />
    </div>
  )
}

export default function FullTree(props: FullTreeProps) {
  return (
    <ReactFlowProvider>
      <FullTreeInner {...props} />
    </ReactFlowProvider>
  )
}
