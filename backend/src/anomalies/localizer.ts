/**
 * ═══════════════════════════════════════════════════════════════
 * SCAFFOLD — NOT IMPLEMENTED
 * Owner: Anomaly Detection Workstream
 * Reference: documents/system_architecture.md §10 Step 2.2
 * ═══════════════════════════════════════════════════════════════
 *
 * PURPOSE: Provide graph traversal and signature classification helpers for
 *   the anomaly detection engine. Functions are extracted from detector.ts
 *   to separate concerns; they will be implemented later.
 * PIPELINE ROLE: Called by `detectAnomalies` to build a connectivity graph,
 *   find the shortest path between two pressure nodes, classify leak vs.
 *   blockage signatures, and compute confidence scores.
 * ALGORITHM & DOMAIN RULES:
 *   - `buildGraph(links)`: create an undirected adjacency map of active links.
 *   - `shortestPath(fromId, toId, graph)`: BFS to return nodeIds and linkIds.
 *   - `classifySignature(residualA, residualB, pathLinkIds, flaggedByElementId)`:
 *       evaluates pressure residual signs and optional flow residual to
 *       return "LEAK", "BLOCKAGE", or "UNKNOWN".
 *   - `calculateConfidence(flaggedA, flaggedB, thresholds, pipeCount)`:
 *       uses the residual magnitude vs. threshold formula and a pipe-count
 *       penalty to produce a 0‑100 confidence score.
 * EXPECTED IMPLEMENTATION STEPS:
 *   1. Define `Graph` type (Map<string, {neighbor:string;linkId:string}[]>).
 *   2. Implement `buildGraph` per detector.ts logic.
 *   3. Implement BFS `shortestPath` returning `{nodeIds:string[];linkIds:string[]}`.
 *   4. Implement `classifySignature` using residual signs and flow check.
 *   5. Implement `calculateConfidence` following the formula from §7.2.
 */

import type { LinkPayload } from "../types.js";
import type { FlaggedPoint } from "../types.js";
import type { AnomalyThresholds } from "./detector.js";

/** Undirected adjacency map for active pipe network links. */
export type Graph = Map<string, { neighbor: string; linkId: string }[]>;

/**
 * Build an undirected graph of active network links.
 * Only includes links where `isActiveLink` returns true and both endpoints exist.
 *
 * DETAILED LOGIC:
 *   const graph = new Map<string, { neighbor: string; linkId: string }[]>();
 *
 *   // Initialize adjacency list for all nodes that appear in links
 *   for (const link of links) {
 *     if (!isActiveLink(link)) continue;          // skip CLOSED pipes, OFF pumps, etc.
 *     const from = link.from_node_id;
 *     const to = link.to_node_id;
 *     if (!from || !to) continue;                 // should not happen after topology validation
 *
 *     // Ensure entries exist
 *     if (!graph.has(from)) graph.set(from, []);
 *     if (!graph.has(to)) graph.set(to, []);
 *
 *     // Add bidirectional edges with link ID
 *     graph.get(from)!.push({ neighbor: to, linkId: link.id });
 *     graph.get(to)!.push({ neighbor: from, linkId: link.id });
 *   }
 *
 *   return graph;
 */
export const buildGraph = (links: LinkPayload[]): Graph => {
  throw new Error("NOT_IMPLEMENTED: buildGraph — see scaffold comment in this file");
};

/** Result of a shortest-path search between two nodes. */
export type PathResult = { nodeIds: string[]; linkIds: string[] } | null;

/**
 * Breadth-first search to find the shortest topological path between two nodes.
 * Returns the ordered node IDs and link IDs along the path, or null if disconnected.
 *
 * DETAILED LOGIC:
 *   if (fromId === toId) return { nodeIds: [fromId], linkIds: [] };
 *
 *   // Standard BFS
 *   const queue: { nodeId: string; pathNodeIds: string[]; pathLinkIds: string[] }[] = [
 *     { nodeId: fromId, pathNodeIds: [fromId], pathLinkIds: [] }
 *   ];
 *   const visited = new Set<string>([fromId]);
 *
 *   while (queue.length > 0) {
 *     const { nodeId, pathNodeIds, pathLinkIds } = queue.shift()!;
 *
 *     const neighbors = graph.get(nodeId) ?? [];
 *     for (const { neighbor, linkId } of neighbors) {
 *       if (visited.has(neighbor)) continue;
 *       if (neighbor === toId) {
 *         // Found target; return completed path
 *         return {
 *           nodeIds: [...pathNodeIds, neighbor],
 *           linkIds: [...pathLinkIds, linkId]
 *         };
 *       }
 *       visited.add(neighbor);
 *       queue.push({
 *         nodeId: neighbor,
 *         pathNodeIds: [...pathNodeIds, neighbor],
 *         pathLinkIds: [...pathLinkIds, linkId]
 *       });
 *     }
 *   }
 *
 *   return null; // no path exists
 */
export const shortestPath = (fromId: string, toId: string, graph: Graph): PathResult => {
  throw new Error("NOT_IMPLEMENTED: shortestPath — see scaffold comment in this file");
};

/** Hydraulic failure signature classification. */
export type Signature = "LEAK" | "BLOCKAGE" | "UNKNOWN";

/**
 * Classify the hydraulic failure signature for a bracketed pipe segment.
 * Inspects pressure residuals at both endpoints and any intervening flow residual.
 * - Leak: both residuals < 0 (pressure drop) AND flow residual ≤ 0
 * - Blockage: residuals have opposite signs (upstream high, downstream low) AND flow residual ≤ 0
 * - Unknown: anything else
 *
 * DETAILED LOGIC:
 *   // 1. Determine which endpoint is upstream (closer to source).
 *   //    Since we don't have direction here, assume the pair order A->B is upstream->downstream
 *   //    based on path direction from shortestPath. The caller should ensure A is upstream.
 *   //    For simplicity, we treat residualA as upstream, residualB as downstream.
 *
 *   // 2. Look for any FLOW_RATE flagged point on the path links.
 *   let flowResidual = 0;
 *   let hasFlowFlag = false;
 *   for (const linkId of pathLinkIds) {
 *     // Flow measurements are attached to links, not nodes.
 *     // We need to check if any flagged point's element_id matches this linkId
 *     // and its type is FLOW_RATE.
 *     const flagged = flaggedByElementId.get(linkId);
 *     if (flagged && flagged.type === "FLOW_RATE") {
 *       flowResidual = flagged.residual;
 *       hasFlowFlag = true;
 *       break; // use first flow measurement found on path
 *     }
 *   }
 *
 *   // 3. Apply classification rules per §7.2:
 *   //    Leak Signature: residualA < 0 AND residualB < 0 AND (flowResidual <= 0 OR !hasFlowFlag)
 *   //    Blockage Signature: residualA > 0 AND residualB < 0 AND (flowResidual <= 0 OR !hasFlowFlag)
 *   //    Note: residual = actual - expected. Negative = lower than expected.
 *
 *   const isLeak = residualA < 0 && residualB < 0 && (!hasFlowFlag || flowResidual <= 0);
 *   const isBlockage = residualA > 0 && residualB < 0 && (!hasFlowFlag || flowResidual <= 0);
 *
 *   if (isLeak) return "LEAK";
 *   if (isBlockage) return "BLOCKAGE";
 *   return "UNKNOWN";
 */
export const classifySignature = (
  residualA: number,
  residualB: number,
  pathLinkIds: string[],
  flaggedByElementId: Map<string, FlaggedPoint>,
): Signature => {
  throw new Error("NOT_IMPLEMENTED: classifySignature — see scaffold comment in this file");
};

/**
 * Compute a 0‑100 confidence score for a suspect segment.
 * Formula per §7.2:
 *   avgResidual = (|residualA| + |residualB|) / 2
 *   avgThreshold = (thresholdA + thresholdB) / 2
 *   residualScore = min(avgResidual / max(avgThreshold, 1e-9), 2.0) / 2.0
 *   pipePenalty = 1 / max(pipeCount, 1)
 *   confidence = min((residualScore * 0.7 + pipePenalty * 0.3) * 100, 100)
 *
 * DETAILED  LOGIC:
 *   // 1. Extract expected values and types from flaggedA and flaggedB
 *   const expectedA = flaggedA.expected;
 *   const expectedB = flaggedB.expected;
 *   const typeA = flaggedA.type; // "PRESSURE_HEAD" or "FLOW_RATE" (should be PRESSURE_HEAD)
 *   const typeB = flaggedB.type;
 *
 *   // 2. Compute thresholds for each point using getThreshold logic
 *   const thrA = getThreshold(typeA, expectedA, thresholds);
 *   const thrB = getThreshold(typeB, expectedB, thresholds);
 *
 *   // 3. avgResidual = (|residualA| + |residualB|) / 2
 *   const avgResidual = (Math.abs(flaggedA.residual) + Math.abs(flaggedB.residual)) / 2;
 *
 *   // 4. avgThreshold = (thrA + thrB) / 2
 *   const avgThreshold = (thrA + thrB) / 2;
 *
 *   // 5. residualScore = min(avgResidual / max(avgThreshold, 1e-9), 2.0) / 2.0
 *   //    This normalizes to [0, 1] where 1 means residual is 2x threshold.
 *   const ratio = avgResidual / Math.max(avgThreshold, 1e-9);
 *   const residualScore = Math.min(ratio, 2.0) / 2.0;
 *
 *   // 6. pipePenalty = 1 / max(pipeCount, 1)
 *   const pipePenalty = 1 / Math.max(pipeCount, 1);
 *
 *   // 7. confidence = min((residualScore * 0.7 + pipePenalty * 0.3) * 100, 100)
 *   const confidence = Math.min((residualScore * 0.7 + pipePenalty * 0.3) * 100, 100);
 *
 *   return confidence;
 */
export const calculateConfidence = (
  flaggedA: FlaggedPoint,
  flaggedB: FlaggedPoint,
  thresholds: AnomalyThresholds,
  pipeCount: number,
): number => {
  throw new Error("NOT_IMPLEMENTED: calculateConfidence — see scaffold comment in this file");
};

// NOTE: getThreshold is defined in detector.ts; if you need it here, import it.
// For now, we assume the caller (detector.ts) will use its own getThreshold.