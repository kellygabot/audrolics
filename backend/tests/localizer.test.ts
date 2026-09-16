import { describe, expect, it } from "vitest";

import {
  buildGraph,
  shortestPath,
  classifySignature,
  calculateConfidence,
} from "../src/anomalies/localizer.js";
import { detectAnomalies } from "../src/anomalies/index.js";
import type { FlaggedPoint, LinkPayload, NodePayload } from "../src/types.js";

const thresholds = {
  pressurePct: 0.05,
  pressureAbs: 0.5,
  flowPct: 0.1,
  flowAbs: 0.5,
};

describe("localizer helpers", () => {
  describe("buildGraph", () => {
    it("skips closed pipes / OFF pumps and builds symmetric adjacency", () => {
      const links: LinkPayload[] = [
        {
          id: "p1",
          label: "P-1",
          type: "PIPE",
          from_node_id: "n1",
          to_node_id: "n2",
          input_params: { status: "OPEN" },
        },
        {
          id: "p2",
          label: "P-2",
          type: "PIPE",
          from_node_id: "n2",
          to_node_id: "n3",
          input_params: { status: "CLOSED" },
        },
        {
          id: "pump1",
          label: "Pump-1",
          type: "PUMP",
          from_node_id: "n3",
          to_node_id: "n4",
          input_params: { status: "OFF" },
        },
        {
          id: "p3",
          label: "P-3",
          type: "PIPE",
          from_node_id: "n2",
          to_node_id: "n4",
          input_params: { status: "OPEN" },
        },
      ];

      const graph = buildGraph(links);

      expect(graph.get("n1")).toEqual([{ neighbor: "n2", linkId: "p1" }]);
      expect(graph.get("n2")).toEqual([
        { neighbor: "n1", linkId: "p1" },
        { neighbor: "n4", linkId: "p3" },
      ]);
      expect(graph.get("n3")).toBeUndefined();
      expect(graph.get("n4")).toEqual([{ neighbor: "n2", linkId: "p3" }]);
    });
  });

  describe("shortestPath", () => {
    it("returns fromId===toId path", () => {
      const graph = new Map([["n1", []]]);
      const path = shortestPath("n1", "n1", graph);
      expect(path).toEqual({ nodeIds: ["n1"], linkIds: [] });
    });

    it("satisfies nodeIds.length === linkIds.length + 1 invariant on multi-hop path", () => {
      const links: LinkPayload[] = [
        { id: "l1", label: "L-1", type: "PIPE", from_node_id: "a", to_node_id: "b" },
        { id: "l2", label: "L-2", type: "PIPE", from_node_id: "b", to_node_id: "c" },
        { id: "l3", label: "L-3", type: "PIPE", from_node_id: "c", to_node_id: "d" },
      ];
      const graph = buildGraph(links);
      const path = shortestPath("a", "d", graph);

      expect(path).not.toBeNull();
      if (path) {
        expect(path.nodeIds).toEqual(["a", "b", "c", "d"]);
        expect(path.linkIds).toEqual(["l1", "l2", "l3"]);
        expect(path.nodeIds.length).toBe(path.linkIds.length + 1);
      }
    });

    it("returns null on a disconnected graph", () => {
      const links: LinkPayload[] = [
        { id: "l1", label: "L-1", type: "PIPE", from_node_id: "a", to_node_id: "b" },
        { id: "l2", label: "L-2", type: "PIPE", from_node_id: "c", to_node_id: "d" },
      ];
      const graph = buildGraph(links);
      const path = shortestPath("a", "d", graph);
      expect(path).toBeNull();
    });
  });

  describe("classifySignature", () => {
    it("classifies LEAK when both pressure residuals are negative and flow residual is missing or negative", () => {
      const flagged = new Map<string, FlaggedPoint>([
        [
          "p1",
          {
            element_id: "p1",
            type: "FLOW_RATE",
            expected: 10,
            actual: 8,
            residual: -2,
          },
        ],
      ]);

      expect(classifySignature(-1, -2, ["p1"], flagged)).toBe("LEAK");
      expect(classifySignature(-1, -2, ["p2"], flagged)).toBe("LEAK");
    });

    it("classifies BLOCKAGE for forward and reverse pressure sign pairs with negative/missing flow residual", () => {
      const flagged = new Map<string, FlaggedPoint>();
      expect(classifySignature(2, -2, ["p1"], flagged)).toBe("BLOCKAGE");
      expect(classifySignature(-2, 2, ["p1"], flagged)).toBe("BLOCKAGE");
    });

    it("classifies UNKNOWN for positive flow residual or non-matching pressure sign combinations", () => {
      const flagged = new Map<string, FlaggedPoint>([
        [
          "p1",
          {
            element_id: "p1",
            type: "FLOW_RATE",
            expected: 10,
            actual: 12,
            residual: 2,
          },
        ],
      ]);

      expect(classifySignature(-2, -2, ["p1"], flagged)).toBe("UNKNOWN");
      expect(classifySignature(2, 2, [], flagged)).toBe("UNKNOWN");
    });
  });

  describe("calculateConfidence", () => {
    it("is bounded in [0, 100], increases with residual magnitude, and decreases with pipeCount", () => {
      const flaggedA: FlaggedPoint = {
        element_id: "j1",
        type: "PRESSURE_HEAD",
        expected: 50,
        actual: 45,
        residual: -5,
      };
      const flaggedB: FlaggedPoint = {
        element_id: "j2",
        type: "PRESSURE_HEAD",
        expected: 50,
        actual: 45,
        residual: -5,
      };

      const c1 = calculateConfidence(flaggedA, flaggedB, thresholds, 1);
      const c2 = calculateConfidence(flaggedA, flaggedB, thresholds, 5);

      expect(c1).toBeGreaterThanOrEqual(0);
      expect(c1).toBeLessThanOrEqual(100);
      expect(c1).toBeGreaterThan(c2);

      const flaggedSmallRes: FlaggedPoint = {
        ...flaggedA,
        actual: 49.2,
        residual: -0.8,
      };
      const cSmall = calculateConfidence(flaggedSmallRes, flaggedSmallRes, thresholds, 1);
      expect(c1).toBeGreaterThan(cSmall);
    });

    it("computes exact expected confidence for a known test case", () => {
      const flaggedA: FlaggedPoint = {
        element_id: "j1",
        type: "PRESSURE_HEAD",
        expected: 50,
        actual: 45,
        residual: -5,
      };
      const flaggedB: FlaggedPoint = {
        element_id: "j2",
        type: "PRESSURE_HEAD",
        expected: 50,
        actual: 45,
        residual: -5,
      };

      // avgResidual = 5, thrA = max(0.05*50, 0.5) = 2.5, thrB = 2.5 -> avgThr = 2.5
      // ratio = 5/2.5 = 2.0 -> residualScore = 2.0/2.0 = 1.0
      // pipePenalty = 1/1 = 1.0
      // confidence = (1.0 * 0.7 + 1.0 * 0.3) * 100 = 100
      const score = calculateConfidence(flaggedA, flaggedB, thresholds, 1);
      expect(score).toBeCloseTo(100, 5);
    });
  });

  describe("behavior preservation end-to-end", () => {
    it("produces identical detectAnomalies output on a representative network", () => {
      const nodes: NodePayload[] = [
        { id: "j1", label: "J-1", type: "JUNCTION", x: 0, y: 0 },
        { id: "j2", label: "J-2", type: "JUNCTION", x: 100, y: 0 },
        { id: "j3", label: "J-3", type: "JUNCTION", x: 200, y: 0 },
      ];
      const links: LinkPayload[] = [
        {
          id: "p1",
          label: "P-1",
          type: "PIPE",
          from_node_id: "j1",
          to_node_id: "j2",
          input_params: { length: 100 },
        },
        {
          id: "p2",
          label: "P-2",
          type: "PIPE",
          from_node_id: "j2",
          to_node_id: "j3",
          input_params: { length: 200 },
        },
      ];
      const measurements = [
        { element_id: "j1", type: "PRESSURE_HEAD" as const, value: 40 },
        { element_id: "j2", type: "PRESSURE_HEAD" as const, value: 35 },
      ];
      const expected = new Map([
        ["j1", 50],
        ["j2", 45],
      ]);

      const res = detectAnomalies(measurements, expected, nodes, links, thresholds);
      expect(res.suspect_segments).toHaveLength(1);
      expect(res.suspect_segments[0]).toMatchObject({
        from: "j1",
        to: "j2",
        signature: "LEAK",
        pipe_ids: ["p1"],
        length_m: 100,
      });
    });
  });
});
