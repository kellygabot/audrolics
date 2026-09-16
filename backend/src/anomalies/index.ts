/**
 * ═══════════════════════════════════════════════════════════════
 * Anomaly Detection & Localization Subsystem Barrel
 * Reference: documents/system_architecture.md §5.2, §7.2
 * ═══════════════════════════════════════════════════════════════
 *
 * CONSUMERS:
 *   - backend/src/routes/anomalies.ts (POST /api/v1/anomalies)
 *
 * FUTURE SCOPE:
 *   - Will re-export localization helpers from localizer.js once implemented.
 */

export { detectAnomalies, buildThresholds } from "./detector.js";
export type { ExpectedValueMap, AnomalyThresholds } from "./detector.js";

// Helper exports from localizer module (for future workstream callers)
export { buildGraph, shortestPath, classifySignature, calculateConfidence } from "./localizer.js";
export type { Graph, PathResult, Signature } from "./localizer.js";