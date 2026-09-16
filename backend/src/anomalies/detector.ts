/**
 * ═══════════════════════════════════════════════════════════════
 * Anomaly Detection — Residual Evaluation & Bracketing Engine
 * Reference: documents/system_architecture.md §7.2, §10 Step 2.1
 *            documents/audrolics_software_requirements_specification.md §4, Appendix C
 * ═══════════════════════════════════════════════════════════════
 *
 * CONSUMERS:
 *   - backend/src/routes/anomalies.ts (POST /api/v1/anomalies)
 *
 * LOCALIZATION LOGIC: Moved to `localizer.ts` for single-source-of-truth graph
 * traversal, leak/blockage classification, and confidence scoring.
 * This file imports and composes those helpers.
 */

import type {
  LinkPayload,
  NodePayload,
  SchematicPayload,
  AnomalyMeasurementInput,
  AnomalyResult,
  FlaggedPoint,
  SuspectSegment,
} from "../types.js";
import { buildThresholds, defaultThresholds, getThreshold, type AnomalyThresholds } from "./thresholds.js";
import {
  buildGraph,
  shortestPath,
  classifySignature,
  calculateConfidence,
  type Graph,
} from "./localizer.js";

/**
 * Expected value map: element_id -> computed value from simulation.
 */
export type ExpectedValueMap = Map<string, number>;

/**
 * Main anomaly detection entry point.
 * Computes residuals, flags points exceeding thresholds, finds bracketing
 * pressure pairs, classifies signatures, and scores confidence.
 *
 * @param measurements - Field measurements from telemetry
 * @param expectedValues - Simulated expected values keyed by element_id
 * @param nodes - Network nodes (for topology context)
 * @param links - Network links (for graph traversal)
 * @param thresholds - Optional schematic-specific thresholds (uses defaults if omitted)
 * @returns AnomalyResult with flagged points, suspect segments, and warnings
 */
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

// Re-export for consumers that may need defaults directly.
export { defaultThresholds };
export { buildThresholds, getThreshold, type AnomalyThresholds } from "./thresholds.js";
export { buildGraph, shortestPath, classifySignature, calculateConfidence, type Graph, type PathResult, type Signature } from "./localizer.js";