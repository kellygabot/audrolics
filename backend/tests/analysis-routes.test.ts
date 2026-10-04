import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({ get: vi.fn() }));
const audit = vi.hoisted(() => ({ insert: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/repositories/schematics.js", () => ({
  SchematicRepository: class { get = repository.get; },
}));
vi.mock("../src/repositories/audit.js", () => ({
  AuditLogRepository: class { insert = audit.insert; },
}));

import { simulationRouter } from "../src/routes/simulation.js";
import { anomaliesRouter } from "../src/routes/anomalies.js";
import { errorHandler } from "../src/utils/errors.js";
import type { LinkPayload, MeasurementPayload, NodePayload } from "../src/types.js";

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.account = { _id: "test" } as unknown as typeof req.account; next(); });
app.use("/simulate", simulationRouter);
app.use("/anomalies", anomaliesRouter);
app.use(errorHandler);

const network = (): { id: string; name: string; nodes: NodePayload[]; links: LinkPayload[]; measurements: MeasurementPayload[] } => ({
  id: "draft-1", name: "", nodes: [
    { id: "r1", label: "", type: "RESERVOIR", x: 0, y: 0, input_params: { total_head: "100" }, computed: {} },
    { id: "j1", label: "", type: "JUNCTION", x: 100, y: 0, input_params: { elevation: "0", base_demand: "10" }, computed: { pressure_head: 999 } },
  ],
  links: [
    { id: "p1", label: "", type: "PIPE", from_node_id: "r1", to_node_id: "j1",
      input_params: { length: "100", diameter: "150", roughness: "140", minor_loss_coeff: "0", status: "OPEN" },
      computed: { flow_rate: 999 } },
  ],
  measurements: [],
});

describe("analysis routes for saved and inline drafts", () => {
  beforeEach(() => { repository.get.mockReset(); audit.insert.mockClear(); });

  it("rejects incomplete saved drafts on both analysis routes", async () => {
    const draft = network();
    draft.nodes[1].input_params!.base_demand = "";
    repository.get.mockResolvedValue(draft);
    const simulation = await request(app).post("/simulate").send({ schematic_id: "draft-1" });
    expect(simulation.status).toBe(422);
    const anomaly = await request(app).post("/anomalies").send({
      schematic_id: "draft-1", measurements: [{ element_id: "j1", type: "PRESSURE_HEAD", value: 10 }],
    });
    expect(anomaly.status).toBe(422);
  });

  it("recomputes anomaly expectations from current inputs instead of stored results", async () => {
    repository.get.mockResolvedValue(network());
    const body = { measurements: [{ element_id: "j1", type: "PRESSURE_HEAD", value: 999 }] };
    const saved = await request(app).post("/anomalies")
      .send({ ...body, schematic_id: "draft-1" });
    expect(saved.status).toBe(200);
    expect(saved.body.flagged_points[0].expected).not.toBe(999);

    const inline = await request(app).post("/anomalies")
      .send({ ...network(), ...body });
    expect(inline.status).toBe(200);
    expect(inline.body.flagged_points[0].expected).toBeCloseTo(saved.body.flagged_points[0].expected);

    const simulation = await request(app).post("/simulate")
      .send({ schematic_id: "draft-1" });
    expect(simulation.status).toBe(200);
    expect(simulation.body.node_results.find((node: { id: string }) => node.id === "j1").pressure_head)
      .toBeCloseTo(saved.body.flagged_points[0].expected);
  });

  it("compares a tank gauge with tank water level, not zero", async () => {
    const draft = network();
    draft.nodes[0] = { ...draft.nodes[0], type: "TANK", input_params: {
      elevation: "30", diameter: "4", min_level: "0", max_level: "10", initial_level: "5",
    } };
    repository.get.mockResolvedValue(draft);
    const result = await request(app).post("/anomalies").send({
      schematic_id: "draft-1", measurements: [{ element_id: "r1", type: "PRESSURE_HEAD", value: 7 }],
    });
    expect(result.status).toBe(200);
    expect(result.body.flagged_points[0].expected).toBe(5);
    expect(result.body.flagged_points[0].residual).toBe(2);
  });

  it("uses schematic filter multipliers for inline and saved simulations", async () => {
    const draft = network();
    draft.nodes.push({ id: "j2", label: "", type: "JUNCTION", x: 200, y: 0,
      input_params: { elevation: "0", base_demand: "10" }, computed: {} });
    draft.nodes[1].input_params!.base_demand = "0";
    draft.links.push({ id: "f1", label: "", type: "FILTER", from_node_id: "j1", to_node_id: "j2",
      input_params: { mesh_size: "1", minor_loss_coeff: "2", filter_status: "CLOGGED" }, computed: {} });
    const filter_multipliers = { clean: 1, partially_clogged: 3, clogged: 7 };
    repository.get.mockResolvedValue({ ...draft, filter_multipliers });
    const saved = await request(app).post("/simulate").send({ schematic_id: "draft-1" });
    const inline = await request(app).post("/simulate")
      .send({ ...draft, filter_multipliers });
    expect(saved.status).toBe(200);
    expect(inline.status).toBe(200);
    expect(saved.body.link_results.find((link: { id: string }) => link.id === "f1").headloss)
      .toBeCloseTo(inline.body.link_results.find((link: { id: string }) => link.id === "f1").headloss);
  });

  it("logs a non-convergent hydraulic control separately from other failures", async () => {
    const draft = network();
    draft.links[0] = { id: "v", label: "V", type: "VALVE", from_node_id: "r1", to_node_id: "j1",
      input_params: { valve_type: "FCV", diameter: 150, valve_setting: 5, status: "ACTIVE" } };
    repository.get.mockResolvedValue(draft);
    const response = await request(app).post("/simulate").send({ schematic_id: "draft-1" });
    expect(response.status).toBe(422);
    expect(response.body.detail.error_code).toBe("E104");
    expect(audit.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "NON_CONVERGENCE" }));
  });
});
