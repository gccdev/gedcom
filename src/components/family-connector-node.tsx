'use client'

import { memo } from 'react'
import { Handle, Position } from 'reactflow'

function FamilyConnectorNode() {
  return (
    <div style={{ width: 8, height: 8, position: 'relative' }}>
      <Handle
        type="target"
        position={Position.Top}
        style={{ opacity: 0, width: 0, height: 0, minWidth: 0, minHeight: 0, border: 'none' }}
      />
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#94a3b8',
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0, width: 0, height: 0, minWidth: 0, minHeight: 0, border: 'none' }}
      />
    </div>
  )
}

export default memo(FamilyConnectorNode)
