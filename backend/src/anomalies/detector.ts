import type { LinkPayload, NodePayload, SchematicPayload, AnomalyMeasurementInput, AnomalyResult, FlaggedPoint, SuspectSegment } from "../types.js";
import { isActiveLink } from "../simulation/topology.js";

export type ExpectedValueMap = Map<string, number>;

export type AnomalyThresholds = {
  pressurePct: number;
  pressureAbs: number;
  flowPct: number;
  flowAbs: number;
};

const defaultThresholds: AnomalyThresholds = {
  pressurePct: 0.05,
  pressureAbs: 0.5,
  flowPct: 0.1,
  flowAbs: 0.5,
};

export const buildThresholds = (
  input?: SchematicPayload["thresholds"],
): AnomalyThresholds => {
  if (!input) return defaultThresholds;
  return {
    pressurePct: input.threshold_pressure_pct / 100,
    pressureAbs: input.threshold_pressure_abs,
    flowPct: input.threshold_flow_pct / 100,
    flowAbs: input.threshold_flow_abs,
  };
};

const getThreshold = (
  type: "PRESSURE_HEAD" | "FLOW_RATE",
  expected: number,
  thresholds: AnomalyThresholds,
): number => {
  if (type === "PRESSURE_HEAD") {
    return Math.max(thresholds.pressurePct * Math.abs(expected), thresholds.pressureAbs);
  }
  return Math.max(thresholds.flowPct * Math.abs(expected), thresholds.flowAbs);
};

type Graph = Map<string, { neighbor: string; linkId: string }[]>;

const buildGraph = (links: LinkPayload[]): Graph => {
  const graph: Graph = new Map();
  for (const link of links) {
    if (!isActiveLink(link)) continue;
    if (!link.from_node_id || !link.to_node_id) continue;
    if (!graph.has(link.from_node_id)) graph.set(link.from_node_id, []);
    if (!graph.has(link.to_node_id)) graph.set(link.to_node_id, []);
    graph.get(link.from_node_id)!.push({ neighbor: link.to_node_id, linkId: link.id });
    graph.get(link.to_node_id)!.push({ neighbor: link.from_node_id, linkId: link.id });
  }
  return graph;
};

const shortestPath = (
  fromId: string,
  toId: string,
  graph: Graph,
): { nodeIds: string[]; linkIds: string[] } | null => {
  if (fromId === toId) return { nodeIds: [fromId], linkIds: [] };
  const visited = new Set<string>();
  const queue: { nodeId: string; path: { nodeId: string; linkId: string }[] }[] = [
    { nodeId: fromId, path: [] },
  ];
  visited.add(fromId);

  while (queue.length > 0) {
    const { nodeId, path } = queue.shift()!;
    const neighbors = graph.get(nodeId) ?? [];
    for (const { neighbor, linkId } of neighbors) {
      if (visited.has(neighbor)) continue;
      const newPath = [...path, { nodeId: neighbor, linkId }];
      if (neighbor === toId) {
        const nodeIds = [fromId, ...newPath.map((step) => step.nodeId)];
        const linkIds = newPath.map((step) => step.linkId);
        return { nodeIds, linkIds };
      }
      visited.add(neighbor);
      queue.push({ nodeId: neighbor, path: newPath });
    }
  }
  return null;
};

const classifySignature = (
  residualA: number,
  residualB: number,
  pathLinkIds: string[],
  flaggedByElementId: Map<string, FlaggedPoint>,
): "LEAK" | "BLOCKAGE" | "UNKNOWN" => {
  // Look for a flow measurement on the path.
  let flowResidual: number | null = null;
  for (const linkId of pathLinkIds) {
    const flagged = flaggedByElementId.get(linkId);
    if (flagged && flagged.type === "FLOW_RATE") {
      flowResidual = flagged.residual;
      break;
    }
  }

  const bothPressureNegative = residualA < 0 && residualB < 0;
  const blockageForward = residualA > 0 && residualB < 0;
  const blockageReverse = residualA < 0 && residualB > 0;

  if (bothPressureNegative) {
    if (flowResidual === null || flowResidual < 0) return "LEAK";
  }
  if (blockageForward || blockageReverse) {
    if (flowResidual === null || flowResidual < 0) return "BLOCKAGE";
  }
  return "UNKNOWN";
};

const calculateConfidence = (
  flaggedA: FlaggedPoint,
  flaggedB: FlaggedPoint,
  thresholds: AnomalyThresholds,
  pipeCount: number,
): number => {
  const avgResidual = (Math.abs(flaggedA.residual) + Math.abs(flaggedB.residual)) / 2;
  const thresholdA = getThreshold(flaggedA.type, flaggedA.expected, thresholds);
  const thresholdB = getThreshold(flaggedB.type, flaggedB.expected, thresholds);
  const avgThreshold = (thresholdA + thresholdB) / 2;
  const residualScore = Math.min(avgResidual / Math.max(avgThreshold, 1e-9), 2.0) / 2.0;
  const pipePenalty = 1 / Math.max(pipeCount, 1);
  return Math.min((residualScore * 0.7 + pipePenalty * 0.3) * 100, 100);
};

export const detectAnomalies = (
  measurements: AnomalyMeasurementInput[],
  expectedValues: ExpectedValueMap,
  nodes: NodePayload[],
  links: LinkPayload[],
  thresholds?: AnomalyThresholds,
): AnomalyResult => {
  const thr = thresholds ?? defaultThresholds;
  const flagged: FlaggedPoint[] = [];
  const flaggedByElementId = new Map<string, FlaggedPoint>();

  for (const m of measurements) {
    const expected = expectedValues.get(m.element_id) ?? 0;
    const residual = m.value - expected;
    const threshold = getThreshold(m.type, expected, thr);
    if (Math.abs(residual) > threshold) {
      const point: FlaggedPoint = {
        element_id: m.element_id,
        type: m.type,
        expected,
        actual: m.value,
        residual,
      };
      flagged.push(point);
      flaggedByElementId.set(m.element_id, point);
    }
  }

  if (flagged.length < 2) {
    return {
      flagged_points: flagged,
      suspect_segments: [],
      warnings: [`E300: Insufficient measurements for segment narrowing. ${flagged.length} point(s) provided.`],
    };
  }

  const graph = buildGraph(links);
  const linkById = new Map(links.map((link) => [link.id, link]));
  const segments: SuspectSegment[] = [];

  for (let i = 0; i < flagged.length; i++) {
    for (let j = i + 1; j < flagged.length; j++) {
      const a = flagged[i];
      const b = flagged[j];

      // Only pressure-pressure pairs can bracket a segment.
      if (a.type !== "PRESSURE_HEAD" || b.type !== "PRESSURE_HEAD") continue;

      const path = shortestPath(a.element_id, b.element_id, graph);
      if (!path || path.linkIds.length === 0) continue;

      const signature = classifySignature(a.residual, b.residual, path.linkIds, flaggedByElementId);
      if (signature === "UNKNOWN") continue;

      const pipeCount = Math.max(path.linkIds.length, 1);
      const confidence = calculateConfidence(a, b, thr, pipeCount);

      const from = signature === "BLOCKAGE" && a.residual < 0 && b.residual > 0 ? b.element_id : a.element_id;
      const to = signature === "BLOCKAGE" && a.residual < 0 && b.residual > 0 ? a.element_id : b.element_id;

      const lengthM = path.linkIds.reduce((sum, linkId) => {
        const link = linkById.get(linkId);
        return sum + (Number(link?.input_params?.length) || 0);
      }, 0);

      segments.push({
        from,
        to,
        confidence,
        signature,
        pipe_ids: path.linkIds,
        length_m: lengthM,
      });
    }
  }

  const warnings: string[] = [];

  // Detect conflicting signatures.
  const hasLeak = segments.some((s) => s.signature === "LEAK");
  const hasBlockage = segments.some((s) => s.signature === "BLOCKAGE");
  if (hasLeak && hasBlockage) {
    warnings.push("E301: Conflicting residuals detected on segment. Manual review required.");
  }

  // Rank by confidence descending and keep top 3.
  segments.sort((a, b) => b.confidence - a.confidence);
  const topSegments = segments.slice(0, 3);

  return {
    flagged_points: flagged,
    suspect_segments: topSegments,
    warnings,
  };
};
