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

  it("keeps pressure and signed flow correct when a pipe's endpoints are reversed", () => {
    const forward = basePayload();
    const reversed = basePayload();
    reversed.links![0] = { ...reversed.links![0], from_node_id: "j1", to_node_id: "r1" };
    const a = runSimulation(forward);
    const b = runSimulation(reversed);
    expect(b.node_results.find((node) => node.id === "j1")?.pressure_head)
      .toBeCloseTo(a.node_results.find((node) => node.id === "j1")?.pressure_head ?? 0, 8);
    expect(b.link_results.find((link) => link.id === "p1")?.flow_rate).toBeCloseTo(-20, 8);
  });

  it("applies pump speed affinity and one-hour energy to a curved pump", () => {
    const network: SchematicPayload = { name: "Pump", nodes: [
      { id: "r", label: "R", type: "RESERVOIR", x: 0, y: 0, input_params: { total_head: 50 } },
      { id: "j", label: "J", type: "JUNCTION", x: 1, y: 0, input_params: { elevation: 0, base_demand: 10 } },
    ], links: [{ id: "pu", label: "PU", type: "PUMP", from_node_id: "r", to_node_id: "j",
      input_params: { pump_curve: [{ flow: 0, head: 20 }, { flow: 20, head: 10 }], speed: 1, status: "ON" } }] };
    const normal = runSimulation(network);
    expect(normal.node_results.find((node) => node.id === "j")?.pressure_head).toBeCloseTo(65, 6);
    expect(normal.link_results[0].head_added).toBeCloseTo(15, 6);
    expect(normal.link_results[0].energy).toBeCloseTo(1.4715, 4);
    network.links![0].input_params!.speed = 2;
    const fast = runSimulation(network);
    expect(fast.link_results[0].head_added).toBeCloseTo(70, 6);
    network.nodes![1].input_params!.base_demand = 50;
    const outOfRange = runSimulation(network);
    expect(outOfRange.link_results[0].head_added).toBeCloseTo(40, 6);
    expect(outOfRange.warnings.some((warning) => warning.includes("E106"))).toBe(true);
  });

  it("holds GPV headloss constant outside its curve range", () => {
    const network: SchematicPayload = { name: "GPV", nodes: [
      { id: "r", label: "R", type: "RESERVOIR", x: 0, y: 0, input_params: { total_head: 100 } },
      { id: "j", label: "J", type: "JUNCTION", x: 1, y: 0, input_params: { elevation: 0, base_demand: 5 } },
    ], links: [{ id: "g", label: "G", type: "VALVE", from_node_id: "r", to_node_id: "j",
      input_params: { valve_type: "GPV", diameter: 150, gpv_curve: [{ flow: 10, headloss: 1 }, { flow: 20, headloss: 2 }], status: "OPEN" } }] };
    expect(runSimulation(network).link_results[0].pressure_drop).toBeCloseTo(1);
    network.nodes![1].input_params!.base_demand = 25;
    expect(runSimulation(network).link_results[0].pressure_drop).toBeCloseTo(2);
  });

  it("uses the adjacent pipe bore and configured multiplier for filter loss", () => {
    const network: SchematicPayload = { name: "Filter", nodes: [
      { id: "r", label: "R", type: "RESERVOIR", x: 0, y: 0, input_params: { total_head: 50 } },
      { id: "m", label: "M", type: "JUNCTION", x: 1, y: 0, input_params: { elevation: 0, base_demand: 0 } },
      { id: "j", label: "J", type: "JUNCTION", x: 2, y: 0, input_params: { elevation: 0, base_demand: 10 } },
    ], links: [
      { id: "p", label: "P", type: "PIPE", from_node_id: "r", to_node_id: "m", input_params: { length: 100, diameter: 200, roughness: 140 } },
      { id: "f", label: "F", type: "FILTER", from_node_id: "m", to_node_id: "j", input_params: { mesh_size: 1, minor_loss_coeff: 2, filter_status: "PARTIALLY_CLOGGED" } },
    ] };
    const result = runSimulation(network);
    const velocity = 0.01 / (Math.PI * 0.1 ** 2);
    expect(result.link_results.find((link) => link.id === "f")?.headloss)
      .toBeCloseTo(3 * 2 * velocity ** 2 / (2 * 9.81), 6);
    network.links![1].from_node_id = "j";
    network.links![1].to_node_id = "m";
    expect(runSimulation(network).link_results.find((link) => link.id === "f")?.headloss)
      .toBeCloseTo(-3 * 2 * velocity ** 2 / (2 * 9.81), 6);
  });

  it("caps an active PRV's downstream pressure while preserving its actual drop", () => {
    const network: SchematicPayload = { name: "PRV", nodes: [
      { id: "r", label: "R", type: "RESERVOIR", x: 0, y: 0, input_params: { total_head: 100 } },
      { id: "j", label: "J", type: "JUNCTION", x: 1, y: 0, input_params: { elevation: 0, base_demand: 10 } },
    ], links: [{ id: "v", label: "V", type: "VALVE", from_node_id: "r", to_node_id: "j",
      input_params: { valve_type: "PRV", diameter: 150, valve_setting: 40, status: "ACTIVE" } }] };
    const result = runSimulation(network);
    expect(result.node_results.find((node) => node.id === "j")?.pressure_head).toBe(40);
    expect(result.link_results[0].pressure_drop).toBe(60);
    network.nodes![1].input_params!.elevation = 10;
    const elevated = runSimulation(network);
    expect(elevated.node_results.find((node) => node.id === "j")?.pressure_head).toBe(40);
    expect(elevated.link_results[0].pressure_drop).toBe(50);
    network.links![0].input_params!.valve_setting = 110;
    expect(() => runSimulation(network)).toThrow(ApiError);
  });

  it("solves an active PRV inside a loop with balanced link flows", () => {
    const network: SchematicPayload = { name: "PRV loop", nodes: [
      { id: "r", label: "R", type: "RESERVOIR", x: 0, y: 0, input_params: { total_head: 100 } },
      { id: "a", label: "A", type: "JUNCTION", x: 1, y: 1, input_params: { elevation: 0, base_demand: 0 } },
      { id: "j", label: "J", type: "JUNCTION", x: 2, y: 0, input_params: { elevation: 0, base_demand: 10 } },
    ], links: [
      { id: "p1", label: "P1", type: "PIPE", from_node_id: "r", to_node_id: "a", input_params: { length: 100, diameter: 150, roughness: 140 } },
      { id: "v", label: "V", type: "VALVE", from_node_id: "a", to_node_id: "j", input_params: { valve_type: "PRV", diameter: 150, valve_setting: 80, status: "ACTIVE" } },
      { id: "p2", label: "P2", type: "PIPE", from_node_id: "r", to_node_id: "j", input_params: { length: 1000, diameter: 100, roughness: 140 } },
    ] };
    const result = runSimulation(network);
    expect(result.node_results.find((node) => node.id === "j")?.pressure_head).toBeCloseTo(80, 2);
    const flows = new Map(result.link_results.map((link) => [link.id, link.flow_rate ?? 0]));
    expect(flows.get("p1")).toBeCloseTo(flows.get("v") ?? 0, 2);
    expect((flows.get("v") ?? 0) + (flows.get("p2") ?? 0)).toBeCloseTo(10, 2);
    expect(result.link_results.find((link) => link.id === "v")?.pressure_drop).toBeGreaterThan(0);
    network.links![1].input_params!.valve_setting = 99.9;
    const nonBinding = runSimulation(network);
    expect(nonBinding.node_results.find((node) => node.id === "j")?.pressure_head).toBeLessThan(99.9);
  });

  it("conserves flow at an active FCV and rejects impossible settings", () => {
    const network: SchematicPayload = { name: "FCV", nodes: [
      { id: "r", label: "R", type: "RESERVOIR", x: 0, y: 0, input_params: { total_head: 100 } },
      { id: "j", label: "J", type: "JUNCTION", x: 1, y: 0, input_params: { elevation: 0, base_demand: 10 } },
    ], links: [{ id: "v", label: "V", type: "VALVE", from_node_id: "r", to_node_id: "j",
      input_params: { valve_type: "FCV", diameter: 150, valve_setting: 10, status: "ACTIVE" } }] };
    expect(runSimulation(network).link_results[0].flow_rate).toBeCloseTo(10);
    network.links![0].input_params!.valve_setting = 5;
    expect(() => runSimulation(network)).toThrow(ApiError);
  });

  it("balances an FCV target inside a loop", () => {
    const network: SchematicPayload = { name: "FCV loop", nodes: [
      { id: "r", label: "R", type: "RESERVOIR", x: 0, y: 0, input_params: { total_head: 100 } },
      { id: "a", label: "A", type: "JUNCTION", x: 1, y: 1, input_params: { elevation: 0, base_demand: 0 } },
      { id: "j", label: "J", type: "JUNCTION", x: 2, y: 0, input_params: { elevation: 0, base_demand: 10 } },
    ], links: [
      { id: "p1", label: "P1", type: "PIPE", from_node_id: "r", to_node_id: "a", input_params: { length: 100, diameter: 150, roughness: 140 } },
      { id: "v", label: "V", type: "VALVE", from_node_id: "a", to_node_id: "j", input_params: { valve_type: "FCV", diameter: 150, valve_setting: 2, status: "ACTIVE" } },
      { id: "p2", label: "P2", type: "PIPE", from_node_id: "r", to_node_id: "j", input_params: { length: 1000, diameter: 100, roughness: 140 } },
    ] };
    const result = runSimulation(network);
    expect(result.link_results.find((link) => link.id === "v")?.flow_rate).toBeCloseTo(2, 3);
    expect(result.link_results.find((link) => link.id === "p1")?.flow_rate).toBeCloseTo(2, 3);
    expect(result.link_results.find((link) => link.id === "p2")?.flow_rate).toBeCloseTo(8, 3);
  });

  it("balances a symmetric loop with near-zero cross flow", () => {
    const network: SchematicPayload = { name: "Loop", nodes: [
      { id: "r", label: "R", type: "RESERVOIR", x: 0, y: 0, input_params: { total_head: 100 } },
      { id: "a", label: "A", type: "JUNCTION", x: 1, y: 1, input_params: { elevation: 0, base_demand: 5 } },
      { id: "b", label: "B", type: "JUNCTION", x: 1, y: -1, input_params: { elevation: 0, base_demand: 5 } },
    ], links: [
      { id: "p1", label: "P1", type: "PIPE", from_node_id: "r", to_node_id: "a", input_params: { length: 100, diameter: 150, roughness: 140 } },
      { id: "p2", label: "P2", type: "PIPE", from_node_id: "r", to_node_id: "b", input_params: { length: 100, diameter: 150, roughness: 140 } },
      { id: "p3", label: "P3", type: "PIPE", from_node_id: "a", to_node_id: "b", input_params: { length: 100, diameter: 150, roughness: 140 } },
    ] };
    const result = runSimulation(network);
    expect(result.node_results.find((node) => node.id === "a")?.pressure_head)
      .toBeCloseTo(result.node_results.find((node) => node.id === "b")?.pressure_head ?? 0, 2);
    expect(result.link_results.find((link) => link.id === "p3")?.flow_rate).toBeCloseTo(0, 2);
    expect(result.link_results.find((link) => link.id === "p1")?.flow_rate).toBeCloseTo(5, 1);
    expect(result.link_results.find((link) => link.id === "p2")?.flow_rate).toBeCloseTo(5, 1);
  });

  it("balances two reservoirs at different heads through real pipe resistance", () => {
    const network: SchematicPayload = { name: "Two sources", nodes: [
      { id: "r1", label: "R1", type: "RESERVOIR", x: 0, y: 0, input_params: { total_head: 100 } },
      { id: "r2", label: "R2", type: "RESERVOIR", x: 2, y: 0, input_params: { total_head: 90 } },
      { id: "j", label: "J", type: "JUNCTION", x: 1, y: 0, input_params: { elevation: 0, base_demand: 0 } },
    ], links: [
      { id: "p1", label: "P1", type: "PIPE", from_node_id: "r1", to_node_id: "j", input_params: { length: 100, diameter: 150, roughness: 140 } },
      { id: "p2", label: "P2", type: "PIPE", from_node_id: "r2", to_node_id: "j", input_params: { length: 100, diameter: 150, roughness: 140 } },
    ] };
    const result = runSimulation(network);
    expect(result.node_results.find((node) => node.id === "j")?.pressure_head).toBeCloseTo(95, 2);
    expect(result.link_results[0].flow_rate).toBeCloseTo(-result.link_results[1].flow_rate!, 2);
    expect(result.max_head_error).toBeLessThanOrEqual(0.001);
    expect(result.max_flow_error).toBeLessThanOrEqual(0.001);
  });
});
