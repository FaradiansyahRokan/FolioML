"use client";

import { useMemo } from 'react';
import ReactFlow, { Background, Controls, Edge, Node, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';

interface Props {
  data: {
    nodes: any[];
    edges: any[];
  } | null;
}

export default function KnowledgeGraph({ data }: Props) {
  const { nodes, edges } = useMemo(() => {
    if (!data || !data.nodes) return { nodes: [], edges: [] };
    
    // Circular Layout
    const radius = Math.max(200, data.nodes.length * 25);
    const centerX = 300;
    const centerY = 300;
    
    const layoutedNodes: Node[] = data.nodes.map((n, i) => {
      const angle = (i / data.nodes.length) * 2 * Math.PI;
      const isPerson = String(n.group || "").toLowerCase().includes("person");
      
      return {
        id: n.id,
        position: { 
          x: centerX + Math.cos(angle) * radius, 
          y: centerY + Math.sin(angle) * radius 
        },
        data: { label: n.label || n.id },
        type: 'default',
        style: {
          background: isPerson ? '#e0f2fe' : '#f0fdf4',
          color: '#0f172a',
          border: isPerson ? '1px solid #7dd3fc' : '1px solid #86efac',
          borderRadius: '8px',
          padding: '10px 15px',
          fontWeight: 600,
          fontSize: '12px',
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        }
      };
    });

    const layoutedEdges: Edge[] = (data.edges || []).map((e, i) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'smoothstep',
      animated: true,
      labelStyle: { fill: '#64748b', fontWeight: 500, fontSize: 11 },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.8 },
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#94a3b8',
      },
    }));

    return { nodes: layoutedNodes, edges: layoutedEdges };
  }, [data]);

  if (!data || nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
        No graph data available.
      </div>
    );
  }

  return (
    <div className="w-full h-[500px] bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-inner">
      <ReactFlow nodes={nodes} edges={edges} fitView attributionPosition="bottom-right">
        <Background color="#cbd5e1" gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
