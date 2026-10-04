import { describe, expect, it } from "vitest";

import { detectAnomalies } from "../src/anomalies/index.js";
import type { LinkPayload, NodePayload, SchematicPayload } from "../src/types.js";

const lineNetwork = (): { nodes: NodePayload[]; links: LinkPayload[] } => ({
  nodes: [
    { id: "j1", label: "J-1", type: "JUNCTION", x: 0, y: 0, input_params: { elevation: 0, base_demand: 0 }, computed: { pressure_head: 50 } },
    { id: "j2", label: "J-2", type: "JUNCTION", x: 100, y: 0, input_params: { elevation: 0, base_demand: 0 }, computed: { pressure_head: 45 } },
    { id: "j3", label: "J-3", type: "JUNCTION", x: 200, y: 0, input_params: { elevation: 0, base_demand: 0 }, computed: { pressure_head: 40 } },
  ],
  links: [
    { id: "p1", label: "P-1", type: "PIPE", from_node_id: "j1", to_node_id: "j2", input_params: { length: 100, diameter: 200, roughness: 140 }, computed: { flow_rate: 10, velocity: 0.32, headloss: 0.5, unit_headloss: 5 } },
    { id: "p2", label: "P-2", type: "PIPE", from_node_id: "j2", to_node_id: "j3", input_params: { length: 100, diameter: 200, roughness: 140 }, computed: { flow_rate: 10, velocity: 0.32, headloss: 0.5, unit_headloss: 5 } },
  ],
});

const thresholds = {
  pressurePct: 0.05,
  pressureAbs: 0.5,
  flowPct: 0.1,
  flowAbs: 0.5,
};

describe("Anomaly detection", () => {
  it("flags measurements exceeding the deviation threshold", () => {
    const { nodes, links } = lineNetwork();
    const measurements = [
      { element_id: "j1", type: "PRESSURE_HEAD" as const, value: 55 },
      { element_id: "j2", type: "PRESSURE_HEAD" as const, value: 42 },
    ];
    const expected = new Map<string, number>([
      ["j1", 50],
      ["j2", 45],
    ]);

    const result = detectAnomalies(measurements, expected, nodes, links, thresholds);

    expect(result.flagged_points).toHaveLength(2);
    expect(result.flagged_points[0].residual).toBeCloseTo(5, 3);
    expect(result.suspect_segments.length).toBeGreaterThan(0);
    expect(result.suspect_segments[0].consistency).toBeCloseTo(Math.abs(5 - (-3)) / 100);
    expect(result.warnings).not.toContain(expect.stringMatching(/E300/));
  });

  it("returns E300 when fewer than 2 measurements are flagged", () => {
    const { nodes, links } = lineNetwork();
    const measurements = [
      { element_id: "j1", type: "PRESSURE_HEAD" as const, value: 55 },
    ];
    const expected = new Map<string, number>([["j1", 50]]);

    const result = detectAnomalies(measurements, expected, nodes, links, thresholds);

    expect(result.flagged_points).toHaveLength(1);
    expect(result.suspect_segments).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("E300"))).toBe(true);
  });

  it("returns E301 when conflicting leak and blockage signatures appear", () => {
    const { nodes, links } = lineNetwork();
    const measurements = [
      { element_id: "j1", type: "PRESSURE_HEAD" as const, value: 55 },
      { element_id: "j2", type: "PRESSURE_HEAD" as const, value: 40 },
      { element_id: "j3", type: "PRESSURE_HEAD" as const, value: 35 },
    ];
    const expected = new Map<string, number>([
      ["j1", 50],
      ["j2", 45],
      ["j3", 40],
    ]);

    const result = detectAnomalies(measurements, expected, nodes, links, thresholds);

    expect(result.flagged_points).toHaveLength(3);
    expect(result.warnings.some((w) => w.includes("E301"))).toBe(true);
    expect(result.suspect_segments.every((segment) => segment.signature !== "UNKNOWN")).toBe(true);
  });

  it("orients blockage by simulated flow rather than measurement order", () => {
    const { nodes, links } = lineNetwork();
    const expected = new Map<string, number>([["j1", 50], ["j2", 45], ["p1", 10]]);
    const result = detectAnomalies([
      { element_id: "j2", type: "PRESSURE_HEAD", value: 40 },
      { element_id: "j1", type: "PRESSURE_HEAD", value: 55 },
    ], expected, nodes, links, thresholds);
    expect(result.suspect_segments[0]).toMatchObject({ from: "j1", to: "j2", signature: "BLOCKAGE" });
  });

  it("does not warn about localization when all measurements agree with the model", () => {
    const { nodes, links } = lineNetwork();
    const result = detectAnomalies([
      { element_id: "j1", type: "PRESSURE_HEAD", value: 50 },
      { element_id: "j2", type: "PRESSURE_HEAD", value: 45 },
    ], new Map([["j1", 50], ["j2", 45]]), nodes, links, thresholds);
    expect(result.flagged_points).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("uses the larger percent-or-absolute threshold and requires a strict exceedance", () => {
    const { nodes, links } = lineNetwork();
    const result = detectAnomalies([
      { element_id: "j1", type: "PRESSURE_HEAD", value: 52.5 }, // 5% of 50: exactly on boundary
      { element_id: "j2", type: "PRESSURE_HEAD", value: 47.6 }, // 5% of 45: 2.25, exceeded
      { element_id: "p1", type: "FLOW_RATE", value: 10.5 }, // 10% of 10: 1, not exceeded
    ], new Map([["j1", 50], ["j2", 45], ["p1", 10]]), nodes, links, thresholds);
    expect(result.flagged_points.map((point) => point.element_id)).toEqual(["j2"]);
  });
});
