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
  BackgroundVariant,
  Panel,
  useNodesState,
  useEdgesState,
} from "reactflow";
import "reactflow/dist/style.css";

// ─── Types ────────────────────────────────────────────────────

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

// ─── Styles ───────────────────────────────────────────────────

const NODE_META: Record<string, { bg: string; border: string; text: string; icon: string; dot: string }> = {
  person:       { bg: "#eff6ff", border: "#3b82f6", text: "#1d4ed8", icon: "👤", dot: "#3b82f6" },
  organization: { bg: "#f0fdf4", border: "#16a34a", text: "#15803d", icon: "🏛️", dot: "#16a34a" },
  concept:      { bg: "#faf5ff", border: "#9333ea", text: "#7e22ce", icon: "💡", dot: "#9333ea" },
  technology:   { bg: "#fff7ed", border: "#ea580c", text: "#c2410c", icon: "⚙️", dot: "#ea580c" },
  event:        { bg: "#fef2f2", border: "#dc2626", text: "#b91c1c", icon: "📅", dot: "#dc2626" },
  location:     { bg: "#f0fdfa", border: "#0d9488", text: "#0f766e", icon: "📍", dot: "#0d9488" },
  metric:       { bg: "#fefce8", border: "#ca8a04", text: "#854d0e", icon: "📊", dot: "#ca8a04" },
  document:     { bg: "#f8fafc", border: "#64748b", text: "#334155", icon: "📄", dot: "#64748b" },
  default:      { bg: "#f1f5f9", border: "#94a3b8", text: "#475569", icon: "●",  dot: "#94a3b8" },
};

// ─── Custom node ──────────────────────────────────────────────

function KGNode({ data }: NodeProps) {
  const meta = NODE_META[data.type as string] ?? NODE_META.default;

  return (
    <>
      {/* Accept edges from all four sides */}
      <Handle type="target" position={Position.Left}   style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="target" position={Position.Top}    style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" position={Position.Right}  style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1 }} />

      <div
        style={{
          background: meta.bg,
          border: `2px solid ${meta.border}`,
          color: meta.text,
          borderRadius: 10,
          padding: "7px 13px",
          minWidth: 100,
          maxWidth: 150,
          textAlign: "center",
          boxShadow: "0 2px 10px rgba(0,0,0,0.09)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1.35,
          userSelect: "none",
        }}
      >
        <div style={{ fontSize: 14, marginBottom: 3 }}>{meta.icon}</div>
        <div style={{ wordBreak: "break-word" }}>{data.label}</div>
        <div style={{ fontSize: 9, marginTop: 3, opacity: 0.6, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {data.type}
        </div>
      </div>
    </>
  );
}

const nodeTypes = { kgNode: KGNode };

// ─── Hierarchical layout (left → right, layered by depth) ─────
//
//  Algorithm:
//  1. Build adjacency map
//  2. BFS from root nodes to assign each node a "column" (depth)
//  3. Within each column, sort nodes by importance and space vertically
//  4. Generous spacing: 280px horizontal, 140px vertical
//  → result: a clear directed flow with far fewer crossing edges

function buildLayout(rawNodes: GraphNode[], rawEdges: GraphEdge[]) {
  if (rawNodes.length === 0) return { nodes: [], edges: [] };

  const COL_W = 280;   // horizontal gap between columns
  const ROW_H = 140;   // vertical gap between nodes in same column

  // ── adjacency ──────────────────────────────────────────────
  const outEdges: Record<string, string[]> = {};
  const inDeg: Record<string, number> = {};

  rawNodes.forEach((n) => {
    outEdges[n.id] = [];
    inDeg[n.id] = 0;
  });

  rawEdges.forEach((e) => {
    if (outEdges[e.source] !== undefined) outEdges[e.source].push(e.target);
    if (inDeg[e.target] !== undefined) inDeg[e.target]++;
  });

  // ── assign columns via BFS from roots ──────────────────────
  const col: Record<string, number> = {};
  // Roots = nodes with no incoming edges; fallback = highest importance
  let roots = rawNodes.filter((n) => inDeg[n.id] === 0).map((n) => n.id);
  if (roots.length === 0) {
    const top = [...rawNodes].sort((a, b) => (b.importance ?? 5) - (a.importance ?? 5))[0];
    roots = [top.id];
  }

  roots.forEach((r) => (col[r] = 0));
  const bfsQ = [...roots];

  while (bfsQ.length > 0) {
    const cur = bfsQ.shift()!;
    for (const child of outEdges[cur] ?? []) {
      const nextCol = (col[cur] ?? 0) + 1;
      if (col[child] === undefined) {
        col[child] = nextCol;
        bfsQ.push(child);
      }
    }
  }
  // Unvisited nodes → put in last column
  const maxCol = rawNodes.reduce((m, n) => Math.max(m, col[n.id] ?? 0), 0);
  rawNodes.forEach((n) => { if (col[n.id] === undefined) col[n.id] = maxCol; });

  // ── group nodes by column ──────────────────────────────────
  const columns: Record<number, GraphNode[]> = {};
  rawNodes.forEach((n) => {
    const c = col[n.id];
    if (!columns[c]) columns[c] = [];
    columns[c].push(n);
  });

  // Within each column, sort by importance desc
  Object.values(columns).forEach((arr) =>
    arr.sort((a, b) => (b.importance ?? 5) - (a.importance ?? 5))
  );

  // ── compute positions ──────────────────────────────────────
  const pos: Record<string, { x: number; y: number }> = {};

  Object.entries(columns).forEach(([cStr, nodes]) => {
    const c = Number(cStr);
    const totalH = nodes.length * ROW_H;
    const startY = -totalH / 2;
    nodes.forEach((n, i) => {
      pos[n.id] = {
        x: c * COL_W,
        y: startY + i * ROW_H,
      };
    });
  });

  // ── build ReactFlow nodes ──────────────────────────────────
  const rfNodes: Node[] = rawNodes.map((n) => ({
    id: n.id,
    type: "kgNode",
    position: pos[n.id] ?? { x: 0, y: 0 },
    data: {
      label: n.label || n.id,
      type: n.type || "default",
      description: n.description,
      importance: n.importance ?? 5,
    },
    style: { background: "transparent", border: "none" },
  }));

  // ── build ReactFlow edges ──────────────────────────────────
  const strengthColors: Record<string, string> = {
    strong: "#6366f1",
    moderate: "#94a3b8",
    weak: "#cbd5e1",
  };
  const strokeWidths: Record<string, number> = { strong: 2.5, moderate: 1.8, weak: 1 };

  const rfEdges: Edge[] = rawEdges.map((e, i) => {
    const s = e.strength ?? "moderate";
    const color = strengthColors[s] ?? "#94a3b8";
    const sw = strokeWidths[s] ?? 1.8;
    return {
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      label: e.label ?? "",
      // "bezier" = smooth curve, no hard corners → far fewer visual crossings
      type: "default",
      animated: s === "strong",
      labelStyle: { fill: "#475569", fontWeight: 600, fontSize: 10 },
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.9 },
      labelBgPadding: [4, 3] as [number, number],
      labelBgBorderRadius: 4,
      style: { stroke: color, strokeWidth: sw, opacity: s === "weak" ? 0.55 : 0.9 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    };
  });

  return { nodes: rfNodes, edges: rfEdges };
}

// ─── Legend ───────────────────────────────────────────────────

function Legend({ types }: { types: string[] }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.95)",
        borderRadius: 12,
        border: "1px solid #e2e8f0",
        padding: "10px 14px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
        maxWidth: 170,
        backdropFilter: "blur(4px)",
      }}
    >
      <p style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
        Node Types
      </p>
      {types.map((t) => {
        const m = NODE_META[t] ?? NODE_META.default;
        return (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <span style={{ fontSize: 13 }}>{m.icon}</span>
            <div style={{ width: 9, height: 9, borderRadius: 3, background: m.dot, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: m.text, fontWeight: 600, textTransform: "capitalize" }}>{t}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Node Detail Sidebar ───────────────────────────────────────

function NodeDetail({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const m = NODE_META[node.type] ?? NODE_META.default;
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.97)",
        borderRadius: 14,
        border: `2px solid ${m.border}`,
        padding: "16px 18px",
        maxWidth: 260,
        boxShadow: "0 8px 32px rgba(0,0,0,0.13)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{m.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: m.text, lineHeight: 1.3 }}>{node.label}</span>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 18, lineHeight: 1, padding: 2 }}
        >
          ×
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <span
          style={{
            background: m.bg,
            color: m.text,
            border: `1px solid ${m.border}`,
            borderRadius: 6,
            padding: "2px 8px",
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {node.type}
        </span>
        {node.importance && (
          <span style={{ fontSize: 10, color: "#94a3b8" }}>
            Importance: <b style={{ color: m.text }}>{node.importance}/10</b>
          </span>
        )}
      </div>

      {node.importance && (
        <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 5,
                borderRadius: 3,
                background: i < (node.importance ?? 0) ? m.dot : "#e2e8f0",
                transition: "background 0.2s",
              }}
            />
          ))}
        </div>
      )}

      {node.description && (
        <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.6, margin: 0 }}>{node.description}</p>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────

export default function KnowledgeGraph({ data }: Props) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const initialLayout = useMemo(() => {
    if (!data?.nodes) return { nodes: [], edges: [] };
    return buildLayout(data.nodes, data.edges ?? []);
  }, [data]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialLayout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialLayout.edges);

  // Sync state if data props change
  useEffect(() => {
    setNodes(initialLayout.nodes);
    setEdges(initialLayout.edges);
  }, [initialLayout, setNodes, setEdges]);

  const presentTypes = useMemo(
    () => Array.from(new Set((data?.nodes ?? []).map((n) => n.type || "default"))),
    [data]
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(data?.nodes.find((n) => n.id === node.id) ?? null);
    },
    [data]
  );

  if (!data?.nodes?.length) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, color: "#94a3b8", gap: 12, background: "#f8fafc", borderRadius: 16, border: "1.5px dashed #e2e8f0" }}>
        <span style={{ fontSize: 36 }}>🕸️</span>
        <span style={{ fontSize: 14, fontWeight: 500 }}>No graph data available.</span>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 520, background: "#f8fafc", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10, fontSize: 11, fontWeight: 600, color: "#64748b", background: "white", padding: "4px 8px", borderRadius: 6, border: "1px solid #e2e8f0", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
        {nodes.length} Nodes • {edges.length} Edges
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={() => setSelectedNode(null)}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        attributionPosition="bottom-right"
        minZoom={0.25}
        maxZoom={3}
        defaultEdgeOptions={{ type: "default" }}
      >
        <Background variant={BackgroundVariant.Dots} color="#cbd5e1" gap={22} size={1.2} />
        <Controls showInteractive={false} style={{ boxShadow: "0 2px 10px rgba(0,0,0,0.08)", borderRadius: 10 }} />
        <MiniMap
          nodeColor={(n) => NODE_META[n.data?.type ?? "default"]?.dot ?? "#94a3b8"}
          maskColor="rgba(248,250,252,0.75)"
          style={{ borderRadius: 10, border: "1px solid #e2e8f0" }}
        />

        {/* Legend — top left via Panel so it doesn't interfere with zoom */}
        <Panel position="top-left">
          <Legend types={presentTypes} />
        </Panel>

        {/* Stats — top right */}
        <Panel position="top-right">
          <div style={{ background: "rgba(255,255,255,0.95)", border: "1px solid #e2e8f0", borderRadius: 8, padding: "5px 11px", fontSize: 11, color: "#64748b", fontWeight: 600, boxShadow: "0 1px 6px rgba(0,0,0,0.06)", backdropFilter: "blur(4px)" }}>
            {data.nodes.length} nodes · {(data.edges ?? []).length} edges
          </div>
        </Panel>

        {/* Summary — top center */}
        {data.summary && (
          <Panel position="top-center">
            <div
              title={data.summary}
              style={{ background: "rgba(255,255,255,0.95)", border: "1px solid #e2e8f0", borderRadius: 10, padding: "5px 16px", fontSize: 12, color: "#475569", fontWeight: 500, boxShadow: "0 1px 6px rgba(0,0,0,0.06)", maxWidth: 360, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", backdropFilter: "blur(4px)" }}
            >
              {data.summary}
            </div>
          </Panel>
        )}

        {/* Node detail — bottom left */}
        {selectedNode && (
          <Panel position="bottom-left">
            <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
