import { Router } from "express";

import { SchematicRepository } from "../repositories/schematics.js";
import { AuditLogRepository } from "../repositories/audit.js";
import { normalizeSchematicPayload, ValidationError } from "../schemas/schematic.js";
import { runSimulation } from "../simulation/index.js";
import type { SchematicPayload, SimulationPayload } from "../types.js";
import { ApiError } from "../utils/errors.js";
import { utcNowIso } from "../utils/time.js";

export const simulationRouter = Router();
const schematicsRepository = new SchematicRepository();
const auditRepository = new AuditLogRepository();

const requireUserId = (value: unknown): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(401, "E400", "X-User-Id header is required until authentication is implemented.");
  }
  return value.trim();
};

const normalizeSimulationPayload = (body: SimulationPayload): SchematicPayload => {
  const raw: Record<string, unknown> = {
    name: body.name ?? "Inline simulation",
    nodes: body.nodes ?? [],
    links: body.links ?? [],
    measurements: body.measurements ?? [],
    thresholds: body.thresholds,
  };
  return normalizeSchematicPayload(raw);
};

simulationRouter.post("/", async (request, response, next) => {
  const userId = requireUserId(request.header("X-User-Id"));
  let schematicId: string | undefined;

  try {
    const body = request.body as SimulationPayload;

    let payload: SchematicPayload;
    if (body.schematic_id) {
      const document = await schematicsRepository.get(userId, body.schematic_id);
      if (!document) {
        throw new ApiError(
          404,
          "E404",
          `Schematic '${body.schematic_id}' does not exist or you do not have permission to access it.`,
        );
      }
      schematicId = document.id;
      payload = {
        name: document.name,
        nodes: document.nodes,
        links: document.links,
        measurements: document.measurements,
        canvas_state: document.canvas_state,
        thresholds: body.thresholds ?? document.thresholds,
        filter_multipliers: document.filter_multipliers,
        styling: document.styling,
        visibility: document.visibility,
      };
    } else {
      payload = normalizeSimulationPayload(body);
    }

    const result = runSimulation(payload);

    const networkSize = (payload.nodes ?? []).length + (payload.links ?? []).length;
    await auditRepository.insert({
      timestamp: utcNowIso(),
      user_id: userId,
      schematic_id: schematicId,
      network_size: networkSize,
      status: "SUCCESS",
    });

    response.json(result);
  } catch (error) {
    const networkSize =
      ((request.body as SimulationPayload).nodes ?? []).length +
      ((request.body as SimulationPayload).links ?? []).length;

    await auditRepository.insert({
      timestamp: utcNowIso(),
      user_id: userId,
      schematic_id: schematicId,
      network_size: networkSize,
      status: "FAILED",
    }).catch(() => {
      // Audit failures must not hide the original simulation error.
    });

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
