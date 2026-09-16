/**
 * Shared anomaly detection threshold logic.
 * Extracted from detector.ts to be consumed by both detector.ts and localizer.ts.
 *
 * Reference: documents/system_architecture.md §7.2
 *            documents/audrolics_software_requirements_specification.md §4, Appendix C
 */

import type { SchematicPayload } from "../types.js";

/** Threshold configuration for anomaly flagging. */
export type AnomalyThresholds = {
  pressurePct: number;
  pressureAbs: number;
  flowPct: number;
  flowAbs: number;
};

/** Default thresholds per SRS: pressure ±5% or ±0.5m, flow ±10% or ±0.5 L/s. */
export const defaultThresholds: AnomalyThresholds = {
  pressurePct: 0.05,
  pressureAbs: 0.5,
  flowPct: 0.1,
  flowAbs: 0.5,
};

/**
 * Build AnomalyThresholds from schematic thresholds payload.
 * Converts percentage values from "percent" (e.g., 5) to decimal (e.g., 0.05).
 */
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

/**
 * Compute the effective deviation threshold for a measurement type.
 * Per SRS: max(percent_threshold * |expected|, absolute_threshold)
 */
export const getThreshold = (
  type: "PRESSURE_HEAD" | "FLOW_RATE",
  expected: number,
  thresholds: AnomalyThresholds,
): number => {
  if (type === "PRESSURE_HEAD") {
    return Math.max(thresholds.pressurePct * Math.abs(expected), thresholds.pressureAbs);
  }
  return Math.max(thresholds.flowPct * Math.abs(expected), thresholds.flowAbs);
};