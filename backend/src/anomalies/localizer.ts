/**
 * ═══════════════════════════════════════════════════════════════
 * Anomaly Localization Helpers
 * Owner: Anomaly Detection Workstream
 * Reference: documents/system_architecture.md §7.2, §10 Step 2.2
 *            documents/audrolics_software_requirements_specification.md §4, Appendix C
 * ═══════════════════════════════════════════════════════════════
 *
 * PURPOSE: Provide graph traversal and signature classification helpers for
 *   the anomaly detection engine. Functions are extracted from detector.ts
 *   to separate concerns and provide a single source of truth for graph
 *   traversal, leak/blockage classification, and confidence scoring.
 * PIPELINE ROLE: Called by `detectAnomalies` to build a connectivity graph,
 *   find the shortest path between two pressure nodes, classify leak vs.
 *   blockage signatures, and compute confidence scores.
 * ALGORITHM & DOMAIN RULES:
 *   - `buildGraph(links)`: creates an undirected adjacency map of active links.
 *   - `shortestPath(fromId, toId, graph)`: BFS returning nodeIds and linkIds.
 *   - `classifySignature(residualA, residualB, pathLinkIds, flaggedByElementId)`:
 *       evaluates pressure residual signs and optional flow residual to
 *       return "LEAK", "BLOCKAGE", or "UNKNOWN".
 *   - `calculateConfidence(flaggedA, flaggedB, thresholds, pipeCount)`:
 *       uses residual magnitude vs. threshold formula and pipe-count penalty
 *       to produce a 0‑100 confidence score.
 */

import type { LinkPayload } from "../types.js";
import type { FlaggedPoint } from "../types.js";
import { isActiveLink } from "../simulation/topology.js";
import { getThreshold, type AnomalyThresholds } from "./thresholds.js";

/** Undirected adjacency map for active pipe network links. */
export type Graph = Map<string, { neighbor: string; linkId: string }[]>;

/**
 * Build an undirected graph of active network links.
 * Only includes links where `isActiveLink` returns true and both endpoints exist.
 *
 * @param links - Array of link payloads from the schematic
 * @returns Graph adjacency map with bidirectional edges
 */
export const buildGraph = (links: LinkPayload[]): Graph => {
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

/** Result of a shortest-path search between two nodes. */
export type PathResult = { nodeIds: string[]; linkIds: string[] } | null;

/**
 * Breadth-first search to find the shortest topological path between two nodes.
 * Returns the ordered node IDs and link IDs along the path, or null if disconnected.
 *
 * @param fromId - Starting node ID
 * @param toId - Target node ID
 * @param graph - Adjacency map from buildGraph
 * @returns PathResult with nodeIds (length N) and linkIds (length N-1), or null
 */
export const shortestPath = (
  fromId: string,
  toId: string,
  graph: Graph,
): PathResult => {
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

/** Hydraulic failure signature classification. */
export type Signature = "LEAK" | "BLOCKAGE" | "UNKNOWN";

/**
 * Classify the hydraulic failure signature for a bracketed pipe segment.
 * Inspects pressure residuals at both endpoints and any intervening flow residual.
 *
 * Rules per detector.ts (matching existing tested behavior):
 * - Scan pathLinkIds in order; take FIRST link where flaggedByElementId has
 *   a FLOW_RATE flagged point; record its residual, else null.
 * - bothPressureNegative = residualA < 0 && residualB < 0
 * - blockageForward = residualA > 0 && residualB < 0
 * - blockageReverse = residualA < 0 && residualB > 0
 * - If bothPressureNegative AND (flowResidual === null OR flowResidual < 0) → "LEAK"
 * - If (blockageForward OR blockageReverse) AND (flowResidual === null OR flowResidual < 0) → "BLOCKAGE"
 * - Otherwise → "UNKNOWN"
 *
 * NOTE: blockageReverse (upstream low, downstream high) is treated symmetrically
 * to blockageForward here. The SRS §7.2 only describes upstream-high/downstream-low
 * for blockage. This symmetric handling is preserved from detector.ts to maintain
 * exact behavioral compatibility. Domain reviewer should confirm if SRS asymmetry
 * was intentional or if reverse case should be UNKNOWN.
 *
 * @param residualA - Pressure residual at first endpoint (assumed upstream by caller)
 * @param residualB - Pressure residual at second endpoint (assumed downstream by caller)
 * @param pathLinkIds - Ordered link IDs along the shortest path from A to B
 * @param flaggedByElementId - Map of element_id -> FlaggedPoint for all flagged measurements
 * @returns "LEAK" | "BLOCKAGE" | "UNKNOWN"
 */
export const classifySignature = (
  residualA: number,
  residualB: number,
  pathLinkIds: string[],
  flaggedByElementId: Map<string, FlaggedPoint>,
): Signature => {
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

/**
 * Compute a 0‑100 confidence score for a suspect segment.
 * Formula per SRS §7.2 / Appendix C:
 *   avgResidual = (|residualA| + |residualB|) / 2
 *   avgThreshold = (thresholdA + thresholdB) / 2
 *   residualScore = min(avgResidual / max(avgThreshold, 1e-9), 2.0) / 2.0
 *   pipePenalty = 1 / max(pipeCount, 1)
 *   confidence = min((residualScore * 0.7 + pipePenalty * 0.3) * 100, 100)
 *
 * @param flaggedA - First flagged pressure point
 * @param flaggedB - Second flagged pressure point
 * @param thresholds - AnomalyThresholds from buildThresholds
 * @param pipeCount - Number of pipes in the segment (path.linkIds.length)
 * @returns Confidence score clamped to [0, 100]
 */
export const calculateConfidence = (
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