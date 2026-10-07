  import { Router } from "express";

  import { SchematicRepository } from "../repositories/schematics.js";
  import { normalizeSchematicPayload, ValidationError } from "../schemas/schematic.js";
  import { runSimulation } from "../simulation/index.js";
  import { buildThresholds, detectAnomalies } from "../anomalies/index.js";
  import type { AnomalyPayload, NodePayload, LinkPayload, SchematicPayload } from "../types.js";
  import { ApiError } from "../utils/errors.js";

  export const anomaliesRouter = Router();
  const schematicsRepository = new SchematicRepository();

  const normalizeAnomalyPayload = (body: AnomalyPayload): SchematicPayload => {
    const raw: Record<string, unknown> = {
      name: (body as Record<string, unknown>).name ?? "Inline anomaly check",
      nodes: body.nodes ?? [],
      links: body.links ?? [],
      measurements: [],
      thresholds: body.thresholds,
      filter_multipliers: body.filter_multipliers,
    };
    return normalizeSchematicPayload(raw);
  };

  const validateMeasurements = (
    measurements: AnomalyPayload["measurements"],
    nodes: NodePayload[],
    links: LinkPayload[],
  ): void => {
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const linkIds = new Set(links.map((l) => l.id));

    for (const m of measurements) {
      if (!m || typeof m.element_id !== "string" ||
          (m.type !== "PRESSURE_HEAD" && m.type !== "FLOW_RATE") ||
          typeof m.value !== "number" || !Number.isFinite(m.value)) {
        throw new ApiError(422, "E200", "Each measurement needs an element_id, valid type, and finite value.");
      }
      if (nodeById.has(m.element_id)) {
        if (m.type !== "PRESSURE_HEAD") {
          throw new ApiError(
            422,
            "E200",
            `Invalid measurement type for node '${m.element_id}': node measurements must use PRESSURE_HEAD.`,
            m.element_id,
            "type",
          );
        }
        if (nodeById.get(m.element_id)?.type === "RESERVOIR") {
          throw new ApiError(422, "E200", "Reservoirs do not produce a pressure-head measurement. Measure a junction or tank.", m.element_id, "element_id");
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

  const expectedValuesFromSimulation = (
    measurements: AnomalyPayload["measurements"],
    result: ReturnType<typeof runSimulation>,
    nodes: NodePayload[],
  ): Map<string, number> => {
    const nodeById = new Map(result.node_results.map((n) => [n.id, n]));
    const inputNodeById = new Map(nodes.map((n) => [n.id, n]));
    const linkById = new Map(result.link_results.map((l) => [l.id, l]));
    const expected = new Map<string, number>();

    // Link flows also establish upstream direction for bracketing even when
    // no field meter was placed on that particular link.
    for (const link of result.link_results) {
      if (typeof link.flow_rate === "number" && Number.isFinite(link.flow_rate)) expected.set(link.id, link.flow_rate);
    }

    for (const m of measurements) {
      if (m.type === "PRESSURE_HEAD") {
        const resultNode = nodeById.get(m.element_id);
        const inputNode = inputNodeById.get(m.element_id);
        const value = resultNode?.pressure_head ?? (typeof resultNode?.hydraulic_head === "number" && inputNode?.type === "TANK"
          ? resultNode.hydraulic_head - Number(inputNode.input_params?.elevation)
          : undefined);
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new ApiError(422, "E200", `No simulated pressure head for '${m.element_id}'.`, m.element_id);
        }
        expected.set(m.element_id, value);
      } else {
        const value = linkById.get(m.element_id)?.flow_rate;
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new ApiError(422, "E200", `No simulated flow rate for '${m.element_id}'.`, m.element_id);
        }
        expected.set(m.element_id, value);
      }
    }

    return expected;
  };

  anomaliesRouter.post("/", async (request, response, next) => {
    const userId = String(request.account!._id);

    try {
      const body = request.body as AnomalyPayload;
      if (!Array.isArray(body.measurements) || body.measurements.length === 0) {
        throw new ApiError(422, "E200", "measurements array is required and must not be empty.", undefined, "measurements");
      }

      let payload: SchematicPayload;

      if (body.schematic_id) {
        const document = await schematicsRepository.get(
          userId,
          body.schematic_id,
        );
        if (!document) {
          throw new ApiError(
            404,
            "E404",
            `Schematic '${body.schematic_id}' does not exist or you do not have permission to access it.`,
          );
        }
        payload = normalizeSchematicPayload({
          name: document.name, nodes: document.nodes, links: document.links,
          measurements: [], thresholds: body.thresholds ?? document.thresholds,
          filter_multipliers: body.filter_multipliers ?? document.filter_multipliers,
        });
      } else {
        payload = normalizeAnomalyPayload(body);
      }

      const nodes = payload.nodes ?? [];
      const links = payload.links ?? [];
      validateMeasurements(body.measurements, nodes, links);
      // Always solve current inputs. Persisted computed values may describe an
      // earlier version of the diagram and cannot be an anomaly baseline.
      const expected = expectedValuesFromSimulation(body.measurements, runSimulation(payload), nodes);

      const result = detectAnomalies(
        body.measurements,
        expected,
        nodes,
        links,
        buildThresholds(payload.thresholds),
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
