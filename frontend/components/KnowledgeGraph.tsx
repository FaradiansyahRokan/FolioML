"use client";

import { useMemo, useState, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Edge,
  Node,
  MarkerType,
  NodeProps,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";

// ─── Type definitions ────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  type: string;
  description?: string;
  importance?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  type?: string;
  strength?: "strong" | "moderate" | "weak";
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary?: string;
}

interface Props {
  data: GraphData | null;
}

// ─── Node type colours & icons ────────────────────────────────

const NODE_STYLES: Record<string, { bg: string; border: string; text: string; icon: string; dot: string }> = {
  person:       { bg: "#eff6ff", border: "#3b82f6", text: "#1e40af", icon: "👤", dot: "#3b82f6" },
  organization: { bg: "#f0fdf4", border: "#22c55e", text: "#15803d", icon: "🏛️", dot: "#22c55e" },
  concept:      { bg: "#faf5ff", border: "#a855f7", text: "#7e22ce", icon: "💡", dot: "#a855f7" },
  technology:   { bg: "#fff7ed", border: "#f97316", text: "#c2410c", icon: "⚙️", dot: "#f97316" },
  event:        { bg: "#fef2f2", border: "#ef4444", text: "#b91c1c", icon: "📅", dot: "#ef4444" },
  location:     { bg: "#f0fdfa", border: "#14b8a6", text: "#0f766e", icon: "📍", dot: "#14b8a6" },
  metric:       { bg: "#fefce8", border: "#eab308", text: "#854d0e", icon: "📊", dot: "#eab308" },
  document:     { bg: "#f8fafc", border: "#64748b", text: "#334155", icon: "📄", dot: "#64748b" },
  default:      { bg: "#f1f5f9", border: "#94a3b8", text: "#475569", icon: "🔵", dot: "#94a3b8" },
};

const EDGE_STRENGTH: Record<string, { strokeWidth: number; opacity: number; dash: string }> = {
  strong:   { strokeWidth: 2.5, opacity: 1,   dash: "none" },
  moderate: { strokeWidth: 1.5, opacity: 0.85, dash: "none" },
  weak:     { strokeWidth: 1,   opacity: 0.6,  dash: "4 3" },
};

// ─── Custom node component ─────────────────────────────────────

function KGNode({ data }: NodeProps) {
  const style = NODE_STYLES[data.type] || NODE_STYLES.default;
  const size = Math.max(28, Math.min(48, 28 + (data.importance || 5) * 2));

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        style={{
          background: style.bg,
          border: `2px solid ${style.border}`,
          color: style.text,
          borderRadius: "10px",
          padding: "8px 12px",
          minWidth: "90px",
          maxWidth: "160px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
          textAlign: "center",
          cursor: "pointer",
          transition: "box-shadow 0.15s, transform 0.15s",
          fontSize: "11px",
          fontWeight: 600,
          lineHeight: 1.3,
        }}
        className="hover:shadow-lg hover:-translate-y-0.5"
      >
        <div style={{ fontSize: `${size / 2.5}px`, marginBottom: "3px" }}>{style.icon}</div>
        <div style={{ wordBreak: "break-word" }}>{data.label}</div>
        <div
          style={{
            fontSize: "9px",
            marginTop: "3px",
            opacity: 0.7,
            fontWeight: 400,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {data.type}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
}

const nodeTypes = { kgNode: KGNode };

// ─── Layout algorithm (force-like concentric) ─────────────────

function buildLayout(rawNodes: GraphNode[], rawEdges: GraphEdge[]) {
  const total = rawNodes.length;
  if (total === 0) return { nodes: [], edges: [] };

  // Sort by importance desc so high-importance nodes are in inner circles
  const sorted = [...rawNodes].sort((a, b) => (b.importance || 5) - (a.importance || 5));

  // Count connections per node
  const degree: Record<string, number> = {};
  rawEdges.forEach((e) => {
    degree[e.source] = (degree[e.source] || 0) + 1;
    degree[e.target] = (degree[e.target] || 0) + 1;
  });

  // Split into rings by importance
  const ring1 = sorted.filter((n) => (n.importance || 5) >= 8);   // inner
  const ring2 = sorted.filter((n) => (n.importance || 5) >= 5 && (n.importance || 5) < 8);
  const ring3 = sorted.filter((n) => (n.importance || 5) < 5);    // outer

  const cx = 500;
  const cy = 400;

  function placeRing(nodes: GraphNode[], radius: number, startAngle = 0): Node[] {
    if (nodes.length === 0) return [];
    return nodes.map((n, i) => {
      const angle = startAngle + (i / nodes.length) * 2 * Math.PI;
      const style = NODE_STYLES[n.type] || NODE_STYLES.default;
      return {
        id: n.id,
        type: "kgNode",
        position: {
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
        },
        data: {
          label: n.label || n.id,
          type: n.type || "default",
          description: n.description,
          importance: n.importance || 5,
        },
        style: { background: "transparent", border: "none" },
      };
    });
  }

  const layoutedNodes: Node[] = [
    ...placeRing(ring1, ring1.length <= 1 ? 0 : 130),
    ...placeRing(ring2, 260, Math.PI / 6),
    ...placeRing(ring3, 400, Math.PI / 8),
  ];

  const strengthColors: Record<string, string> = {
    strong: "#6366f1",
    moderate: "#94a3b8",
    weak: "#cbd5e1",
  };

  const layoutedEdges: Edge[] = rawEdges.map((e, i) => {
    const s = e.strength || "moderate";
    const edgeStyle = EDGE_STRENGTH[s] || EDGE_STRENGTH.moderate;
    return {
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      label: e.label || "",
      type: "smoothstep",
      animated: s === "strong",
      labelStyle: { fill: "#475569", fontWeight: 500, fontSize: 10 },
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.85 },
      labelBgPadding: [4, 3] as [number, number],
      labelBgBorderRadius: 4,
      style: {
        stroke: strengthColors[s],
        strokeWidth: edgeStyle.strokeWidth,
        opacity: edgeStyle.opacity,
        strokeDasharray: edgeStyle.dash,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: strengthColors[s],
        width: 16,
        height: 16,
      },
    };
  });

  return { nodes: layoutedNodes, edges: layoutedEdges };
}

// ─── Legend ────────────────────────────────────────────────────

function Legend({ types }: { types: string[] }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        background: "white",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        padding: "10px 14px",
        zIndex: 10,
        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        maxWidth: 200,
      }}
    >
      <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        Legend
      </p>
      {types.map((t) => {
        const s = NODE_STYLES[t] || NODE_STYLES.default;
        return (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <span style={{ fontSize: 12 }}>{s.icon}</span>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: s.dot, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: s.text, fontWeight: 600, textTransform: "capitalize" }}>{t}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Node detail panel ─────────────────────────────────────────

function NodeDetail({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const s = NODE_STYLES[node.type] || NODE_STYLES.default;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        right: 16,
        background: "white",
        borderRadius: 14,
        border: `2px solid ${s.border}`,
        padding: "14px 18px",
        zIndex: 20,
        maxWidth: 260,
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 18 }}>{s.icon}</span>
          <span style={{ marginLeft: 6, fontSize: 13, fontWeight: 700, color: s.text }}>{node.label}</span>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 16, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <span
        style={{
          display: "inline-block",
          background: s.bg,
          color: s.text,
          border: `1px solid ${s.border}`,
          borderRadius: 6,
          padding: "2px 8px",
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 8,
        }}
      >
        {node.type}
      </span>
      {node.description && (
        <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, margin: 0 }}>{node.description}</p>
      )}
      {node.importance && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>Importance:</span>
          <div style={{ display: "flex", gap: 2 }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: i < (node.importance || 5) ? s.dot : "#e2e8f0",
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────

export default function KnowledgeGraph({ data }: Props) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    if (!data?.nodes) return { nodes: [], edges: [] };
    return buildLayout(data.nodes, data.edges || []);
  }, [data]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const presentTypes = useMemo(() => {
    if (!data?.nodes) return [];
    return [...new Set(data.nodes.map((n) => n.type || "default"))];
  }, [data]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const raw = data?.nodes.find((n) => n.id === node.id) || null;
      setSelectedNode(raw);
    },
    [data]
  );

  if (!data || !data.nodes || data.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-400 bg-zinc-50 rounded-xl border border-dashed border-zinc-200 gap-3">
        <span style={{ fontSize: 32 }}>🕸️</span>
        <span className="text-sm font-medium">No graph data available.</span>
      </div>
    );
  }

  return (
    <div className="w-full h-[580px] bg-[#f8fafc] rounded-xl border border-zinc-200 overflow-hidden shadow-inner relative">
      {/* Summary banner */}
      {data.summary && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: "6px 16px",
            zIndex: 10,
            fontSize: 12,
            color: "#475569",
            fontWeight: 500,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            maxWidth: "50%",
            textAlign: "center",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={data.summary}
        >
          {data.summary}
        </div>
      )}

      {/* Stats badge */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: "5px 10px",
          zIndex: 10,
          fontSize: 11,
          color: "#64748b",
          fontWeight: 600,
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        {data.nodes.length} nodes · {(data.edges || []).length} edges
      </div>

      <Legend types={presentTypes} />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        attributionPosition="bottom-right"
        minZoom={0.3}
        maxZoom={2.5}
      >
        <Background variant={BackgroundVariant.Dots} color="#cbd5e1" gap={20} size={1} />
        <Controls style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)", borderRadius: 8 }} />
        <MiniMap
          style={{ borderRadius: 10, border: "1px solid #e2e8f0", bottom: 16, right: 16 }}
          nodeColor={(n) => {
            const type = n.data?.type || "default";
            return NODE_STYLES[type]?.dot || "#94a3b8";
          }}
          maskColor="rgba(248,250,252,0.7)"
        />
      </ReactFlow>

      {selectedNode && (
        <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
    </div>
  );
}
