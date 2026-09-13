import { describe, expect, it } from "vitest";

import { computeHeadloss, runSimulation } from "../src/simulation/index.js";
import { validateNetworkTopology } from "../src/simulation/topology.js";
import { ApiError } from "../src/utils/errors.js";
import type { SchematicPayload } from "../src/types.js";

const basePayload = (): SchematicPayload => ({
  name: "Test network",
  nodes: [
    { id: "r1", label: "R-1", type: "RESERVOIR", x: 0, y: 0, input_params: { total_head: 100 } },
    { id: "j1", label: "J-1", type: "JUNCTION", x: 100, y: 0, input_params: { elevation: 0, base_demand: 10 } },
    { id: "j2", label: "J-2", type: "JUNCTION", x: 200, y: 0, input_params: { elevation: 0, base_demand: 5 } },
    { id: "j3", label: "J-3", type: "JUNCTION", x: 100, y: 100, input_params: { elevation: 0, base_demand: 5 } },
  ],
  links: [
    { id: "p1", label: "P-1", type: "PIPE", from_node_id: "r1", to_node_id: "j1", input_params: { length: 1000, diameter: 300, roughness: 140 } },
    { id: "p2", label: "P-2", type: "PIPE", from_node_id: "j1", to_node_id: "j2", input_params: { length: 500, diameter: 200, roughness: 140 } },
    { id: "p3", label: "P-3", type: "PIPE", from_node_id: "j1", to_node_id: "j3", input_params: { length: 500, diameter: 200, roughness: 140 } },
  ],
});

describe("Simulation topology validation", () => {
  it("throws E100 when no reservoir or tank exists", () => {
    const payload: SchematicPayload = {
      name: "No source",
      nodes: [
        { id: "j1", label: "J-1", type: "JUNCTION", x: 0, y: 0, input_params: { elevation: 0, base_demand: 1 } },
        { id: "j2", label: "J-2", type: "JUNCTION", x: 100, y: 0, input_params: { elevation: 0, base_demand: 1 } },
      ],
      links: [
        { id: "p1", label: "P-1", type: "PIPE", from_node_id: "j1", to_node_id: "j2", input_params: { length: 100, diameter: 150 } },
      ],
    };
    expect(() => validateNetworkTopology(payload)).toThrow(ApiError);
    try {
      validateNetworkTopology(payload);
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).errorCode).toBe("E100");
    }
  });

  it("throws E101 for an orphaned node", () => {
    const payload = basePayload();
    payload.nodes!.push({ id: "j4", label: "J-4", type: "JUNCTION", x: 300, y: 0, input_params: { elevation: 0, base_demand: 0 } });
    expect(() => validateNetworkTopology(payload)).toThrow(ApiError);
    try {
      validateNetworkTopology(payload);
    } catch (error) {
      expect((error as ApiError).errorCode).toBe("E101");
    }
  });

  it("throws E102 for a dangling link", () => {
    const payload = basePayload();
    payload.links!.push({ id: "p4", label: "P-4", type: "PIPE", from_node_id: "j2", input_params: { length: 100, diameter: 150 } });
    expect(() => validateNetworkTopology(payload)).toThrow(ApiError);
    try {
      validateNetworkTopology(payload);
    } catch (error) {
      expect((error as ApiError).errorCode).toBe("E102");
    }
  });

  it("throws E103 for a disconnected subgraph", () => {
    const payload = basePayload();
    payload.nodes!.push({ id: "j4", label: "J-4", type: "JUNCTION", x: 300, y: 0, input_params: { elevation: 0, base_demand: 1 } });
    payload.nodes!.push({ id: "j5", label: "J-5", type: "JUNCTION", x: 300, y: 100, input_params: { elevation: 0, base_demand: 1 } });
    payload.links!.push({ id: "p4", label: "P-4", type: "PIPE", from_node_id: "j4", to_node_id: "j5", input_params: { length: 100, diameter: 150 } });
    expect(() => validateNetworkTopology(payload)).toThrow(ApiError);
    try {
      validateNetworkTopology(payload);
    } catch (error) {
      expect((error as ApiError).errorCode).toBe("E103");
    }
  });
});

describe("Hazen-Williams headloss", () => {
  it("matches the Hazen-Williams formula (SRS Appendix B constants)", () => {
    // The SRS Appendix B example states 0.0674 m, but its intermediate
    // arithmetic is inconsistent with the formula constants it lists.
    // Evaluating h_f = 10.67 * L * Q^1.852 / (C^1.852 * D^4.87) directly
    // with Q=0.01 m^3/s, D=0.15 m gives approximately 0.230 m.
    const hf = computeHeadloss(100, 150, 140, 10);
    expect(hf).toBeCloseTo(0.2301, 3);
  });
});

describe("GGA steady-state solver", () => {
  it("solves a simple branched network with expected pressure and flow trends", () => {
    const result = runSimulation(basePayload());

    expect(result.status).toBe("success");
    expect(result.iterations).toBeLessThanOrEqual(200);
    expect(result.max_head_error).toBeLessThanOrEqual(0.001);
    expect(result.max_flow_error).toBeLessThanOrEqual(0.001);

    const heads = new Map(result.node_results.map((n) => [n.id, n.pressure_head ?? n.hydraulic_head ?? 0]));
    const flows = new Map(result.link_results.map((l) => [l.id, l.flow_rate ?? 0]));

    // Reservoir head is fixed at 100 m; downstream heads decrease.
    expect(heads.get("j1")).toBeLessThan(100);
    expect(heads.get("j2")).toBeLessThan(heads.get("j1")!);
    expect(heads.get("j3")).toBeLessThan(heads.get("j1")!);

    // Total supply equals total demand (~20 L/s).
    expect(flows.get("p1")).toBeCloseTo(20, 1);
    expect(Math.abs(flows.get("p2")!)).toBeCloseTo(5, 1);
    expect(Math.abs(flows.get("p3")!)).toBeCloseTo(5, 1);
  });
});
