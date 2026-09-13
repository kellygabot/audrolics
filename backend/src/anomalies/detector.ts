export interface AnomalyMeasurement {
  element_id: string;
  type: "PRESSURE_HEAD" | "FLOW_RATE";
  value: number;
}

export interface AnomalyOutput {
  flagged_points: Array<{ element_id: string; expected: number; actual: number; residual: number }>;
  suspect_segments: Array<{ from: string; to: string; confidence: number; signature: "LEAK" | "BLOCKAGE" | "UNKNOWN" }>;
  warnings: string[];
}

export function detectAnomalies(
  measurements: AnomalyMeasurement[],
  expectedValues: Map<string, number>,
  thresholds: { pressurePct: number; pressureAbs: number; flowPct: number; flowAbs: number }
): AnomalyOutput {
  const flagged = [];
  for (const m of measurements) {
    const expected = expectedValues.get(m.element_id) ?? 0;
    const residual = m.value - expected;
    const threshold = m.type === "PRESSURE_HEAD"
      ? Math.max(thresholds.pressurePct * Math.abs(expected), thresholds.pressureAbs)
      : Math.max(thresholds.flowPct * Math.abs(expected), thresholds.flowAbs);

    if (Math.abs(residual) > threshold) {
      flagged.push({ element_id: m.element_id, expected, actual: m.value, residual });
    }
  }

  if (flagged.length < 2) {
    return { flagged_points: flagged, suspect_segments: [], warnings: ["E300: Insufficient measurements for segment narrowing"] };
  }

  return { flagged_points: flagged, suspect_segments: [], warnings: [] };
}