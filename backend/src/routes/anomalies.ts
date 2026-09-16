  import { Router } from "express";

  import { SchematicRepository } from "../repositories/schematics.js";
  import { normalizeSchematicPayload, ValidationError } from "../schemas/schematic.js";
  import { runSimulation } from "../simulation/index.js";
  import { buildThresholds, detectAnomalies } from "../anomalies/index.js";
  import type { AnomalyPayload, NodePayload, LinkPayload, SchematicPayload } from "../types.js";
  import { ApiError } from "../utils/errors.js";

  export const anomaliesRouter = Router();
  const schematicsRepository = new SchematicRepository();

  const requireUserId = (value: unknown): string => {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ApiError(401, "E400", "X-User-Id header is required until authentication is implemented.");
    }
    return value.trim();
  };

  const normalizeAnomalyPayload = (body: AnomalyPayload): SchematicPayload => {
    const raw: Record<string, unknown> = {
      name: (body as Record<string, unknown>).name ?? "Inline anomaly check",
      nodes: body.nodes ?? [],
      links: body.links ?? [],
      measurements: [],
      thresholds: body.thresholds,
    };
    return normalizeSchematicPayload(raw);
  };

  const validateMeasurements = (
    measurements: AnomalyPayload["measurements"],
    nodes: NodePayload[],
    links: LinkPayload[],
  ): void => {
    const nodeIds = new Set(nodes.map((n) => n.id));
    const linkIds = new Set(links.map((l) => l.id));

    for (const m of measurements) {
      if (nodeIds.has(m.element_id)) {
        if (m.type !== "PRESSURE_HEAD") {
          throw new ApiError(
            422,
            "E200",
            `Invalid measurement type for node '${m.element_id}': node measurements must use PRESSURE_HEAD.`,
            m.element_id,
            "type",
          );
        }
      } else if (linkIds.has(m.element_id)) {
        if (m.type !== "FLOW_RATE") {
          throw new ApiError(
            422,
            "E200",
            `Invalid measurement type for link '${m.element_id}': link measurements must use FLOW_RATE.`,
            m.element_id,
            "type",
          );
        }
      } else {
        throw new ApiError(
          422,
          "E200",
          `Measurement element_id '${m.element_id}' does not reference a node or link.`,
          m.element_id,
          "element_id",
        );
      }
    }
  };

  const extractExpectedValues = (
    measurements: AnomalyPayload["measurements"],
    nodes: NodePayload[],
    links: LinkPayload[],
  ): Map<string, number> | null => {
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const linkById = new Map(links.map((l) => [l.id, l]));
    const expected = new Map<string, number>();

    for (const m of measurements) {
      if (m.type === "PRESSURE_HEAD") {
        const node = nodeById.get(m.element_id);
        const value = node?.computed?.pressure_head;
        if (typeof value !== "number") return null;
        expected.set(m.element_id, value);
      } else {
        const link = linkById.get(m.element_id);
        const value = link?.computed?.flow_rate;
        if (typeof value !== "number") return null;
        expected.set(m.element_id, value);
      }
    }

    return expected;
  };

  const expectedValuesFromSimulation = (
    measurements: AnomalyPayload["measurements"],
    result: ReturnType<typeof runSimulation>,
  ): Map<string, number> => {
    const nodeById = new Map(result.node_results.map((n) => [n.id, n]));
    const linkById = new Map(result.link_results.map((l) => [l.id, l]));
    const expected = new Map<string, number>();

    for (const m of measurements) {
      if (m.type === "PRESSURE_HEAD") {
        expected.set(m.element_id, nodeById.get(m.element_id)?.pressure_head ?? 0);
      } else {
        expected.set(m.element_id, linkById.get(m.element_id)?.flow_rate ?? 0);
      }
    }

    return expected;
  };

  anomaliesRouter.post("/", async (request, response, next) => {
    requireUserId(request.header("X-User-Id"));

    try {
      const body = request.body as AnomalyPayload;
      if (!Array.isArray(body.measurements) || body.measurements.length === 0) {
        throw new ApiError(422, "E200", "measurements array is required and must not be empty.", undefined, "measurements");
      }

      let nodes: NodePayload[];
      let links: LinkPayload[];
      let thresholds = body.thresholds;

      if (body.schematic_id) {
        const document = await schematicsRepository.get(
          request.header("X-User-Id")!.trim(),
          body.schematic_id,
        );
        if (!document) {
          throw new ApiError(
            404,
            "E404",
            `Schematic '${body.schematic_id}' does not exist or you do not have permission to access it.`,
          );
        }
        nodes = document.nodes;
        links = document.links;
        thresholds ??= document.thresholds;
      } else {
        const payload = normalizeAnomalyPayload(body);
        nodes = payload.nodes ?? [];
        links = payload.links ?? [];
        thresholds ??= payload.thresholds;
      }

      validateMeasurements(body.measurements, nodes, links);

      let expected = extractExpectedValues(body.measurements, nodes, links);
      if (!expected) {
        const payload: SchematicPayload = {
          name: "Inline simulation",
          nodes,
          links,
          thresholds,
          measurements: [],
        };
        const simResult = runSimulation(payload);
        expected = expectedValuesFromSimulation(body.measurements, simResult);
      }

      const result = detectAnomalies(
        body.measurements,
        expected,
        nodes,
        links,
        buildThresholds(thresholds),
      );

      response.json(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        next(new ApiError(422, "E200", error.message));
        return;
      }
      if (error instanceof ApiError) {
        next(error);
        return;
      }
      next(new ApiError(500, "E500", error instanceof Error ? error.message : "Unexpected server error."));
    }
  });
