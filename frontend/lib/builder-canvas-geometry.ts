export type CanvasPoint = { x: number; y: number };
export type CanvasNode = CanvasPoint & {
  type: "JUNCTION" | "RESERVOIR" | "TANK";
};

const EPSILON = 1e-6;

function cross(a: CanvasPoint, b: CanvasPoint): number {
  return a.x * b.y - a.y * b.x;
}

function rayPolygonDistance(direction: CanvasPoint, vertices: CanvasPoint[]): number {
  let nearest = Infinity;
  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    const edge = { x: end.x - start.x, y: end.y - start.y };
    const denominator = cross(direction, edge);
    if (Math.abs(denominator) < EPSILON) continue;
    const distance = cross(start, edge) / denominator;
    const edgePosition = cross(start, direction) / denominator;
    if (
      distance >= 0 &&
      edgePosition >= -EPSILON &&
      edgePosition <= 1 + EPSILON
    ) {
      nearest = Math.min(nearest, distance);
    }
  }
  return Number.isFinite(nearest) ? nearest : 0;
}

// Coordinates follow the visible strokes of the supplied SVGs, relative to
// their image centers. They deliberately do not use the transparent image box.
function nodeOutlineDistance(type: CanvasNode["type"], direction: CanvasPoint): number {
  if (type === "JUNCTION") {
    const radiusX = 16;
    const radiusY = 16;
    return 1 / Math.hypot(direction.x / radiusX, direction.y / radiusY);
  }
  if (type === "RESERVOIR") {
    return rayPolygonDistance(direction, [
      { x: -1, y: -16 },
      { x: 18, y: 12 },
      { x: -19, y: 12 },
    ]);
  }
  return rayPolygonDistance(direction, [
    { x: -20, y: -12 },
    { x: 17, y: -12 },
    { x: 17, y: 10 },
    { x: -20, y: 10 },
  ]);
}

export function nodeBoundaryPoint(
  node: CanvasNode,
  toward: CanvasPoint,
  symbolScale: number,
): CanvasPoint {
  const dx = toward.x - node.x;
  const dy = toward.y - node.y;
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) return { x: node.x, y: node.y };
  const direction = { x: dx / length, y: dy / length };
  const distance = nodeOutlineDistance(node.type, direction) * symbolScale;
  return {
    x: node.x + direction.x * distance,
    y: node.y + direction.y * distance,
  };
}

export function linkEndpoints(
  from: CanvasNode,
  to: CanvasNode,
  symbolScale: number,
): { start: CanvasPoint; end: CanvasPoint; length: number } {
  const start = nodeBoundaryPoint(from, to, symbolScale);
  const end = nodeBoundaryPoint(to, from, symbolScale);
  const centerLength = Math.hypot(to.x - from.x, to.y - from.y);
  if (centerLength < EPSILON) {
    return { start, end, length: 0 };
  }
  const direction = {
    x: (to.x - from.x) / centerLength,
    y: (to.y - from.y) / centerLength,
  };
  const visibleLength =
    (end.x - start.x) * direction.x + (end.y - start.y) * direction.y;
  if (visibleLength <= 0) {
    const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    return { start: middle, end: middle, length: 0 };
  }
  return { start, end, length: visibleLength };
}

export function fitInlineSymbolScale(
  availableLength: number,
  requestedScale: number,
  nativePortSpan: number,
): number {
  if (availableLength <= 4 || nativePortSpan <= 0) return 0;
  return Math.min(requestedScale, (availableLength - 4) / nativePortSpan);
}
