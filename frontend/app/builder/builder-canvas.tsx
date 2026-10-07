import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { fitInlineSymbolScale, linkEndpoints, nodeBoundaryPoint } from "@/lib/builder-canvas-geometry";
import type { AnomalyApiResponse } from "@/lib/builder-storage";
import { distance, findLinkPath } from "./builder-graph";
import type { BuilderNode, BuilderLink, SchematicModel, Point, LinkType, NodeType } from "./builder-model";

// Node artwork and canvas-only inline devices use their intrinsic aspect ratios.
// The palette deliberately retains the original link graphics.
const nodeSymbols: Record<NodeType, { src: string; width: number; height: number }> = {
  JUNCTION: { src: "/junction.svg", width: 38, height: 39 },
  RESERVOIR: { src: "/reservoir.svg", width: 44, height: 39 },
  TANK: { src: "/tank.svg", width: 42, height: 27 },
};

const linkSymbols: Record<Exclude<LinkType, "PIPE">, {
  src: string;
  width: number;
  height: number;
  portSpan: number;
  nativeAxis: "horizontal" | "vertical";
  portAxisOffsetX?: number;
}> = {
  // The original pump and strainer connect vertically. Their clean artwork
  // omits those short stubs, so the canvas line meets the top/bottom outlines.
  PUMP: { src: "/pump_clean.svg", width: 58, height: 45, portSpan: 45, nativeAxis: "vertical", portAxisOffsetX: -7 },
  VALVE: { src: "/valve_clean.svg", width: 56, height: 41, portSpan: 56, nativeAxis: "horizontal" },
  FILTER: { src: "/strainer_clean.svg", width: 44, height: 44, portSpan: 44, nativeAxis: "vertical" },
};

// A node's saved position is the center of its artwork and the drag anchor.
export function NodeShape({
  node,
  model,
  selected,
  onPointerDown,
  onPointerUp,
  onContextMenu,
}: {
  node: BuilderNode;
  model: SchematicModel;
  selected: boolean;
  onPointerDown: (
    event: ReactPointerEvent<SVGGElement>,
    node: BuilderNode,
  ) => void;
  onPointerUp: (
    event: ReactPointerEvent<SVGGElement>,
    node: BuilderNode,
  ) => void;
  onContextMenu: (event: ReactMouseEvent<SVGGElement>) => void;
}) {
  const symbol = nodeSymbols[node.type];
  const width = symbol.width * model.styling.symbol_size;
  const height = symbol.height * model.styling.symbol_size;
  const labelX = node.x + width / 2 + 7;
  return (
    <g
      data-element-id={node.id}
      className="cursor-pointer"
      onPointerDown={(event) => onPointerDown(event, node)}
      onPointerUp={(event) => onPointerUp(event, node)}
      onContextMenu={onContextMenu}
    >
      {selected && (
        <rect
          x={node.x - width / 2 - 5}
          y={node.y - height / 2 - 5}
          width={width + 10}
          height={height + 10}
          rx="5"
          fill="none"
          stroke="#1d4ed8"
          strokeWidth="2"
          pointerEvents="none"
        />
      )}
      <image
        href={symbol.src}
        x={node.x - width / 2}
        y={node.y - height / 2}
        width={width}
        height={height}
        preserveAspectRatio="xMidYMid meet"
      />
      <text
        x={labelX}
        y={node.y + 4}
        fill="#0f172a"
        fontSize="12"
        fontWeight="600"
      >
        {node.label}
      </text>
      {model.visibility.elevation &&
        (typeof node.input_params.elevation === "string" ||
          typeof node.input_params.elevation === "number") &&
        node.input_params.elevation !== "" && (
          <text
            x={labelX}
            y={node.y + 18}
            fill="#64748b"
            fontSize="11"
          >
            Elev {node.input_params.elevation} m
          </text>
        )}
      {model.visibility.pressure &&
        node.computed.pressure_head !== null &&
        node.computed.pressure_head !== undefined && (
          <text
            x={labelX}
            y={node.y + 32}
            fill="#64748b"
            fontSize="11"
          >
            Pressure {node.computed.pressure_head} m
          </text>
        )}
    </g>
  );
}

// Resolve link endpoints from node ids on every render. Cached link.points are
// kept for export, while node positions remain the drawing source of truth.
export function LinkShape({
  link,
  model,
  selected,
  onPointerDown,
  onContextMenu,
}: {
  link: BuilderLink;
  model: SchematicModel;
  selected: boolean;
  onPointerDown: (
    event: ReactPointerEvent<SVGGElement>,
    link: BuilderLink,
  ) => void;
  onContextMenu: (event: ReactMouseEvent<SVGGElement>) => void;
}) {
  const from = model.nodes.find((node) => node.id === link.from_node_id);
  const to = model.nodes.find((node) => node.id === link.to_node_id);
  if (!from || !to) return null;
  const segment = linkEndpoints(from, to, model.styling.symbol_size);
  const mid = {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2,
  };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const unit = length ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
  const symbol = link.type === "PIPE" ? null : linkSymbols[link.type];
  const symbolScale = symbol
    ? fitInlineSymbolScale(segment.length, model.styling.symbol_size, symbol.portSpan)
    : 0;
  const leftPort = symbol
    ? {
      x: mid.x - unit.x * symbol.portSpan * symbolScale / 2,
      y: mid.y - unit.y * symbol.portSpan * symbolScale / 2,
    }
    : mid;
  const rightPort = symbol
    ? {
      x: mid.x + unit.x * symbol.portSpan * symbolScale / 2,
      y: mid.y + unit.y * symbol.portSpan * symbolScale / 2,
    }
    : mid;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI -
    (symbol?.nativeAxis === "vertical" ? 90 : 0);
  const radians = (angle * Math.PI) / 180;
  const symbolHalfWidth = symbol
    ? (Math.abs(Math.cos(radians)) * symbol.width +
      Math.abs(Math.sin(radians)) * symbol.height) * symbolScale / 2
    : 0;
  const labelX = mid.x + symbolHalfWidth + 10;
  const stroke = selected ? "#f97316" : model.styling.line_color;
  const strokeWidth = selected
    ? model.styling.line_thickness + 2
    : model.styling.line_thickness;
  return (
    <g
      data-element-id={link.id}
      className="cursor-pointer"
      onPointerDown={(event) => onPointerDown(event, link)}
      onContextMenu={onContextMenu}
    >
      <line
        x1={segment.start.x}
        y1={segment.start.y}
        x2={segment.end.x}
        y2={segment.end.y}
        stroke="transparent"
        strokeWidth="18"
        pointerEvents="stroke"
      />
      <line
        x1={segment.start.x}
        y1={segment.start.y}
        x2={symbol && symbolScale > 0 ? leftPort.x : segment.end.x}
        y2={symbol && symbolScale > 0 ? leftPort.y : segment.end.y}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="butt"
      />
      {symbol && symbolScale > 0 && (
        <>
          <line
            x1={rightPort.x}
            y1={rightPort.y}
            x2={segment.end.x}
            y2={segment.end.y}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />
          <LinkSymbol symbol={symbol} mid={mid} angle={angle} size={symbolScale} />
        </>
      )}
      <text
        x={labelX}
        y={mid.y - 8}
        fill="#0f172a"
        fontSize="12"
        fontWeight="600"
      >
        {link.label}
      </text>
      {model.visibility.length &&
        typeof link.input_params.length === "string" &&
        link.input_params.length !== "" && (
          <text x={labelX} y={mid.y + 8} fill="#64748b" fontSize="11">
            {link.input_params.length} m
          </text>
        )}
      {model.visibility.diameter &&
        (typeof link.input_params.diameter === "string" ||
          typeof link.input_params.diameter === "number") &&
        link.input_params.diameter !== "" && (
          <text x={labelX} y={mid.y + 22} fill="#64748b" fontSize="11">
            Dia {link.input_params.diameter} mm
          </text>
        )}
      {model.visibility.flow &&
        link.computed.flow_rate !== null &&
        link.computed.flow_rate !== undefined && (
          <text x={labelX} y={mid.y + 36} fill="#64748b" fontSize="11">
            Flow {link.computed.flow_rate} L/s
          </text>
        )}
    </g>
  );
}

function LinkSymbol({
  symbol,
  mid,
  angle,
  size,
}: {
  symbol: { src: string; width: number; height: number; portAxisOffsetX?: number };
  mid: Point;
  angle: number;
  size: number;
}) {
  const width = symbol.width * size;
  const height = symbol.height * size;
  return (
    <image
      href={symbol.src}
      x={mid.x - width / 2 - (symbol.portAxisOffsetX ?? 0) * size}
      y={mid.y - height / 2}
      width={width}
      height={height}
      transform={`rotate(${angle} ${mid.x} ${mid.y})`}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

export function AnomalyOverlays({
  model,
  anomalyResult,
  hovered,
  onHover,
  layer,
}: {
  model: SchematicModel;
  anomalyResult: AnomalyApiResponse;
  hovered: number | null;
  onHover: (index: number | null) => void;
  layer: "routes" | "labels";
}) {
  return (
    <>
      {layer === "labels" && anomalyResult.flagged_points.map((flag, index) => {
        const node = model.nodes.find((item) => item.id === flag.element_id);
        const link = model.links.find((item) => item.id === flag.element_id);
        const from = link && model.nodes.find((item) => item.id === link.from_node_id);
        const to = link && model.nodes.find((item) => item.id === link.to_node_id);
        const point = node ? { x: node.x, y: node.y } : from && to
          ? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } : null;
        if (!point) return null;
        return (
          <g key={`flag-${index}`} pointerEvents="none" aria-label={`Anomaly at ${flag.element_id}`}>
            <circle cx={point.x} cy={point.y - 28} r="11" fill="#fff" stroke="#b91c1c" strokeWidth="2" />
            <text x={point.x} y={point.y - 24} textAnchor="middle" fill="#b91c1c" fontSize="12" fontWeight="bold">!</text>
            <title>{`Measured ${flag.actual}; expected ${flag.expected}; residual ${flag.residual}`}</title>
          </g>
        );
      })}
      {anomalyResult.suspect_segments.map((segment, index) => {
        const path =
          segment.pipe_ids && segment.pipe_ids.length > 0
            ? segment.pipe_ids
            : segment.path && segment.path.length > 0
              ? segment.path
              : findLinkPath(segment.from, segment.to, model.links);
        if (!path || path.length === 0) return null;
        const visibleLinks: { start: Point; end: Point }[] = [];
        for (const linkId of path) {
          const link = model.links.find((l) => l.id === linkId);
          if (!link) continue;
          const from = model.nodes.find((n) => n.id === link.from_node_id);
          const to = model.nodes.find((n) => n.id === link.to_node_id);
          if (!from || !to) continue;
          visibleLinks.push(linkEndpoints(from, to, model.styling.symbol_size));
        }
        if (visibleLinks.length === 0) return null;
        const middleLink = visibleLinks[Math.floor(visibleLinks.length / 2)];
        const mid = {
          x: (middleLink.start.x + middleLink.end.x) / 2,
          y: (middleLink.start.y + middleLink.end.y) / 2,
        };
        const color = segment.signature === "LEAK" ? "#ef4444" : "#f97316";
        if (layer === "routes") {
          return (
            <g key={index} onMouseEnter={() => onHover(index)} onMouseLeave={() => onHover(null)}>
              {visibleLinks.map(({ start, end }, linkIndex) => (
                <line
                  key={linkIndex}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={color}
                  strokeWidth="6"
                  strokeDasharray="6 4"
                  opacity="0.6"
                  pointerEvents="stroke"
                  style={{ cursor: "pointer" }}
                />
              ))}
            </g>
          );
        }
        if (hovered !== index) return null;
        return (
          <g key={index} pointerEvents="none">
            <rect
              x={mid.x + 8}
              y={mid.y - 38}
              width="160"
              height="34"
              rx="4"
              fill="rgba(15, 23, 42, 0.9)"
            />
            <text
              x={mid.x + 16}
              y={mid.y - 18}
              fill="white"
              fontSize="11"
              fontWeight="600"
            >
              {segment.signature} — {Math.round(segment.confidence)}% confidence
            </text>
          </g>
        );
      })}
    </>
  );
}

export function PendingLink({
  model,
  pendingLink,
}: {
  model: SchematicModel;
  pendingLink: { fromNodeId: string; cursor: Point };
}) {
  const from = model.nodes.find((node) => node.id === pendingLink.fromNodeId);
  if (!from) return null;
  const start = nodeBoundaryPoint(
    from,
    pendingLink.cursor,
    model.styling.symbol_size,
  );
  const end = distance(from, pendingLink.cursor) < distance(from, start)
    ? start
    : pendingLink.cursor;
  return (
    <line
      x1={start.x}
      y1={start.y}
      x2={end.x}
      y2={end.y}
      stroke="#f97316"
      strokeWidth="2"
      strokeDasharray="8 6"
    />
  );
}

