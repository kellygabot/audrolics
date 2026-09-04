import { Router } from "express";

import { SchematicRepository } from "../repositories/schematics.js";
import { normalizeSchematicPayload, ValidationError } from "../schemas/schematic.js";
import { ApiError } from "../utils/errors.js";

export const schematicsRouter = Router();
const repository = new SchematicRepository();

const requireUserId = (value: unknown) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(401, "E400", "X-User-Id header is required until authentication is implemented.");
  }
  return value.trim();
};

const raiseNotFound = (schematicId: string) => {
  throw new ApiError(
    404,
    "E404",
    `Schematic '${schematicId}' does not exist or you do not have permission to access it.`,
  );
};

schematicsRouter.get("/", async (request, response, next) => {
  try {
    const userId = requireUserId(request.header("X-User-Id"));
    response.json(await repository.list(userId));
  } catch (error) {
    next(error);
  }
});

schematicsRouter.post("/", async (request, response, next) => {
  try {
    const userId = requireUserId(request.header("X-User-Id"));
    const payload = normalizeSchematicPayload(request.body);
    response.status(201).json(await repository.create(userId, payload));
  } catch (error) {
    if (error instanceof ValidationError) next(new ApiError(422, "E200", error.message));
    else next(error);
  }
});

schematicsRouter.get("/:schematicId", async (request, response, next) => {
  try {
    const userId = requireUserId(request.header("X-User-Id"));
    const document = await repository.get(userId, request.params.schematicId);
    if (!document) raiseNotFound(request.params.schematicId);
    response.json(document);
  } catch (error) {
    next(error);
  }
});

schematicsRouter.put("/:schematicId", async (request, response, next) => {
  try {
    const userId = requireUserId(request.header("X-User-Id"));
    const payload = normalizeSchematicPayload(request.body);
    const document = await repository.update(userId, request.params.schematicId, payload);
    if (!document) raiseNotFound(request.params.schematicId);
    response.json(document);
  } catch (error) {
    if (error instanceof ValidationError) next(new ApiError(422, "E200", error.message));
    else next(error);
  }
});

schematicsRouter.delete("/:schematicId", async (request, response, next) => {
  try {
    const userId = requireUserId(request.header("X-User-Id"));
    const deleted = await repository.delete(userId, request.params.schematicId);
    if (!deleted) raiseNotFound(request.params.schematicId);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
