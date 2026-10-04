import { describe, expect, it } from "vitest";

import { normalizeDraftSchematicPayload, normalizeSchematicPayload, ValidationError } from "../src/schemas/schematic.js";

const validPayload = () => ({
  name: "Main field segment",
  nodes: [
    {
      id: "node-1",
      label: "J-1",
      type: "JUNCTION",
      x: 10,
      y: 20,
      input_params: { elevation: 0, base_demand: 1 },
      computed: {},
    },
    {
      id: "node-2",
      label: "R-1",
      type: "RESERVOIR",
      x: 100,
      y: 20,
      input_params: { total_head: 20 },
      computed: {},
    },
  ],
  links: [
    {
      id: "link-1",
      label: "P-1",
      type: "PIPE",
      from_node_id: "node-2",
      to_node_id: "node-1",
      input_params: { length: 100, diameter: 150 },
      computed: {},
    },
  ],
  measurements: [],
});

describe("MERN schematic schema", () => {
  it("normalizes saved schematic payloads using the shared backend contract", () => {
    const schematic = normalizeSchematicPayload(validPayload());

    expect(schematic.links?.[0].input_params).toEqual({
      length: 100,
      diameter: 150,
      roughness: 140,
      minor_loss_coeff: 0,
      status: "OPEN",
    });
    expect(schematic.links?.[0].computed).toEqual({
      flow_rate: null,
      velocity: null,
      headloss: null,
      unit_headloss: null,
    });
  });

  it("saves unfinished drafts without rewriting blank values or curves", () => {
    const draft = {
      name: "",
      nodes: [{ id: "node-1", label: "", type: "JUNCTION", x: 10, y: 20,
        input_params: { elevation: "", base_demand: "bad" }, computed: {} }],
      links: [{ id: "link-1", label: "", type: "PUMP", from_node_id: "node-1",
        to_node_id: null, points: [], input_params: { rated_power: "", speed: "", status: "",
          pump_curve: [{ flow: "", head: "" }] }, computed: {} }],
    };
    const saved = normalizeDraftSchematicPayload(draft);
    expect(saved.name).toBe("");
    expect(saved.nodes?.[0].input_params).toEqual(draft.nodes[0].input_params);
    expect(saved.links?.[0].input_params).toEqual(draft.links[0].input_params);
    expect(saved.links?.[0].to_node_id).toBeUndefined();
    expect(() => normalizeSchematicPayload(saved)).toThrow(ValidationError);
  });

  it("allows empty canvases and blank names", () => {
    expect(normalizeDraftSchematicPayload({ name: "", nodes: [], links: [] }).name).toBe("");
  });

  it("rejects malformed draft structure", () => {
    expect(() => normalizeDraftSchematicPayload({ name: "", nodes: [{ id: "x", label: "", type: "BAD", x: 0, y: 0, input_params: {} }] })).toThrow(ValidationError);
    expect(() => normalizeDraftSchematicPayload({ name: "", nodes: [
      { id: "x", label: "", type: "JUNCTION", x: 0, y: 0, input_params: {} },
      { id: "x", label: "", type: "JUNCTION", x: 1, y: 1, input_params: {} },
    ] })).toThrow(ValidationError);
    const overlappingIds = validPayload();
    overlappingIds.links[0].id = "node-1";
    expect(() => normalizeDraftSchematicPayload(overlappingIds)).toThrow(ValidationError);
  });

  it("accepts numeric editor strings and blank labels during strict analysis", () => {
    const payload = validPayload();
    payload.name = "";
    payload.nodes[0].label = "";
    payload.nodes[1].label = "";
    payload.links[0].label = "";
    payload.nodes[0].input_params.elevation = "0" as unknown as number;
    expect(normalizeSchematicPayload(payload).nodes?.[0].input_params?.elevation).toBe(0);
  });

  it("rejects invalid graph endpoints during analysis", () => {
    const payload = validPayload();
    payload.links[0].to_node_id = "missing-node";

    expect(normalizeDraftSchematicPayload(payload).links?.[0].to_node_id).toBe("missing-node");
    expect(() => normalizeSchematicPayload(payload)).toThrow(ValidationError);
  });
});
