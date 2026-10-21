import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Background,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  useNodesState,
} from "@xyflow/react";
import type { Edge, EdgeProps } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import type { Connection } from "../shared/connections";
import { isSymmetric } from "../shared/connections";
import type { LibraryItem } from "../shared/library";
import "@xyflow/react/dist/style.css";

function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  label,
  markerEnd,
  style,
  data,
}: EdgeProps<Edge<{ offset: number; description: string }>>) {
  const distance = Math.max(70, Math.abs(targetX - sourceX) * 0.4);
  const offset = (data?.offset ?? 0) + (targetX < sourceX ? 100 : 0);
  const path = `M ${sourceX},${sourceY} C ${sourceX + distance},${sourceY + offset} ${targetX - distance},${targetY + offset} ${targetX},${targetY}`;
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className="react-flow__edge-text relation-label nodrag nopan"
          title={data?.description}
          style={{
            transform: `translate(-50%, -50%) translate(${(sourceX + targetX) / 2}px,${(sourceY + targetY) / 2 + offset * 0.75}px)`,
          }}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
const edgeTypes = { relationship: RelationshipEdge };

function MapCanvas({
  insights,
  connections,
}: {
  insights: LibraryItem[];
  connections: Connection[];
}) {
  const navigate = useNavigate();
  const layout = useMemo(() => {
    const graph = new dagre.graphlib.Graph({ multigraph: true })
      .setGraph({ rankdir: "LR", nodesep: 45, ranksep: 150 })
      .setDefaultEdgeLabel(() => ({}));
    for (const item of insights)
      graph.setNode(item.id, { width: 240, height: 110 });
    const visible = new Set(insights.map((item) => item.id));
    const links = connections.filter(
      (edge) => visible.has(edge.insightA) && visible.has(edge.insightB),
    );
    for (const edge of links)
      graph.setEdge(edge.insightA, edge.insightB, {}, edge.id);
    dagre.layout(graph);
    return {
      nodes: insights.map((item) => ({
        id: item.id,
        position: {
          x: graph.node(item.id).x - 120,
          y: graph.node(item.id).y - 55,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: { width: 240, height: 110 },
        data: {
          label: (
            <div className="map-node-label">
              <Link
                onClick={(e) => e.stopPropagation()}
                to={`/insights?insight=${item.id}`}
                title={item.title}
              >
                {item.title}
              </Link>
              <small>{item.seeds.join(" · ") || "Unclassified"}</small>
            </div>
          ),
        },
      })),
      edges: links.map((edge) => {
        const siblings = links.filter(
          (item) =>
            [item.insightA, item.insightB].sort().join(":") ===
            [edge.insightA, edge.insightB].sort().join(":"),
        );
        const offset =
          (siblings.findIndex((item) => item.id === edge.id) -
            (siblings.length - 1) / 2) *
          70;
        return {
          id: edge.id,
          type: "relationship",
          data: {
            offset,
            description: `${insights.find((item) => item.id === edge.insightA)?.title}: ${edge.relationship}: ${insights.find((item) => item.id === edge.insightB)?.title}`,
          },
          source: edge.insightA,
          target: edge.insightB,
          label: edge.relationship,
          ariaLabel: `${insights.find((item) => item.id === edge.insightA)?.title}: ${edge.relationship}: ${insights.find((item) => item.id === edge.insightB)?.title}`,
          markerEnd: isSymmetric(edge.relationship)
            ? undefined
            : { type: MarkerType.ArrowClosed },
          style: { stroke: "#355c50" },
          labelStyle: { fontSize: 14 },
          labelBgStyle: { fill: "#fff" },
        };
      }),
    };
  }, [insights, connections]);
  const [nodes, , onNodesChange] = useNodesState(layout.nodes);
  return (
    <div className="connection-map" aria-label="Connections Map">
      <ReactFlow
        nodes={nodes}
        edges={layout.edges}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => navigate(`/insights?insight=${node.id}`)}
        nodesConnectable={false}
        edgesReconnectable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
        fitView
        minZoom={0.15}
        maxZoom={2}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
export function ConnectionMap(props: {
  insights: LibraryItem[];
  connections: Connection[];
}) {
  // New saved data remounts the canvas for automatic layout; dragging otherwise lasts for this session.
  const key =
    props.insights.map((item) => item.id).join(",") +
    "|" +
    props.connections.map((edge) => edge.id).join(",");
  return (
    <MapCanvas
      key={key}
      insights={props.insights}
      connections={props.connections}
    />
  );
}
