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
      { element_id: "j1", type: "PRESSURE_HEAD" as const, value: 45 },
      { element_id: "j2", type: "PRESSURE_HEAD" as const, value: 40 },
      { element_id: "j3", type: "PRESSURE_HEAD" as const, value: 45 },
    ];
    const expected = new Map<string, number>([
      ["j1", 50],
      ["j2", 45],
      ["j3", 40],
    ]);

    const result = detectAnomalies(measurements, expected, nodes, links, thresholds);

    expect(result.flagged_points).toHaveLength(3);
    expect(result.warnings.some((w) => w.includes("E301"))).toBe(true);
  });
});
