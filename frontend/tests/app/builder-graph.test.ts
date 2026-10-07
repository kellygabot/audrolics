import { describe, expect, it } from "vitest";
import { defaultModel } from "../../app/builder/builder-model";
import { defaultLinkParams, defaultNodeParams, findLinkPath, fromApiPayload, nextLabel, normalizeParams, updateLinkPointsForNodes, validateModel } from "../../app/builder/builder-graph";

describe("builder graph rules", () => {
  it("keeps saved draft strings while normalizing analysis inputs", () => {
    const params = { ...defaultNodeParams("JUNCTION"), elevation: "12.5", demand_pattern: "001", base_demand: "" };
    expect(normalizeParams(params)).toEqual({ elevation: 12.5, demand_pattern: "001", base_demand: "" });
    expect(params.elevation).toBe("12.5");
  });

  it("restores legacy payloads with current document defaults", () => {
    const restored = fromApiPayload({ name: "Old", nodes: [], links: [] } as unknown as ReturnType<typeof defaultModel>);
    expect(restored.measurements).toEqual([]);
    expect(restored.filter_multipliers).toEqual(defaultModel().filter_multipliers);
  });

  it("finds connected link paths and updates their saved endpoints", () => {
    const nodes = [
      { id: "a", label: "J-1", type: "JUNCTION" as const, x: 1, y: 2, input_params: defaultNodeParams("JUNCTION"), computed: {} },
      { id: "b", label: "J-2", type: "JUNCTION" as const, x: 3, y: 4, input_params: defaultNodeParams("JUNCTION"), computed: {} },
    ];
    const links = [{ id: "pipe", label: "P-1", type: "PIPE" as const, from_node_id: "a", to_node_id: "b", points: [], input_params: defaultLinkParams("PIPE"), computed: {} }];
    expect(findLinkPath("a", "b", links)).toEqual(["pipe"]);
    expect(updateLinkPointsForNodes(links, nodes)[0].points).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
    expect(nextLabel("PIPE", { ...defaultModel(), nodes, links })).toBe("P-2");
  });

  it("validates incomplete connected elements without changing them", () => {
    const model = defaultModel();
    const link = { id: "pipe", label: "P-1", type: "PIPE" as const, from_node_id: null, to_node_id: null, points: [], input_params: defaultLinkParams("PIPE"), computed: {} };
    model.links.push(link);
    expect(validateModel(model)["pipe.endpoints"]).toBe("Both endpoints must be connected.");
    expect(link.from_node_id).toBeNull();
  });
});
