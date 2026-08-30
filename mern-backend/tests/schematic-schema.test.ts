import { describe, expect, it } from "vitest";

import { normalizeSchematicPayload, ValidationError } from "../src/schemas/schematic.js";

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

  it("rejects invalid graph endpoints before persistence", () => {
    const payload = validPayload();
    payload.links[0].to_node_id = "missing-node";

    expect(() => normalizeSchematicPayload(payload)).toThrow(ValidationError);
  });
});
