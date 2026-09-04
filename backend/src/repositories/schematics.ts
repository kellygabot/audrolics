import { randomUUID } from "node:crypto";

import { SchematicModel } from "../models/Schematic.js";
import type { SchematicDocument, SchematicPayload, SchematicSummary } from "../types.js";
import { utcNowIso } from "../utils/time.js";

const withoutMongoId = { _id: 0 };

export class SchematicRepository {
  async list(userId: string): Promise<SchematicSummary[]> {
    return SchematicModel.find({ user_id: userId }, withoutMongoId)
      .sort({ updated_at: -1 })
      .select({ id: 1, name: 1, updated_at: 1 })
      .lean<SchematicSummary[]>()
      .exec();
  }

  async get(userId: string, schematicId: string): Promise<SchematicDocument | null> {
    return SchematicModel.findOne({ id: schematicId, user_id: userId }, withoutMongoId)
      .lean<SchematicDocument>()
      .exec();
  }

  async create(userId: string, payload: SchematicPayload): Promise<SchematicDocument> {
    const now = utcNowIso();
    const document: SchematicDocument = {
      ...payload,
      nodes: payload.nodes ?? [],
      links: payload.links ?? [],
      measurements: payload.measurements ?? [],
      canvas_state: payload.canvas_state ?? { zoom: 100, pan: { x: 0, y: 0 } },
      thresholds: payload.thresholds ?? {
        threshold_pressure_pct: 5,
        threshold_pressure_abs: 0.5,
        threshold_flow_pct: 10,
        threshold_flow_abs: 0.5,
      },
      filter_multipliers: payload.filter_multipliers ?? { clean: 1, partially_clogged: 3, clogged: 10 },
      styling: payload.styling ?? { line_color: "#0f766e", line_thickness: 2, symbol_size: 1 },
      visibility: payload.visibility ?? { length: true, diameter: true, pressure: true, flow: true, elevation: true },
      id: randomUUID(),
      user_id: userId,
      created_at: now,
      updated_at: now,
    };

    await SchematicModel.create(document);
    return document;
  }

  async update(
    userId: string,
    schematicId: string,
    payload: SchematicPayload,
  ): Promise<SchematicDocument | null> {
    const existing = await this.get(userId, schematicId);
    if (!existing) return null;

    const document: SchematicDocument = {
      ...payload,
      nodes: payload.nodes ?? [],
      links: payload.links ?? [],
      measurements: payload.measurements ?? [],
      canvas_state: payload.canvas_state ?? { zoom: 100, pan: { x: 0, y: 0 } },
      thresholds: payload.thresholds ?? {
        threshold_pressure_pct: 5,
        threshold_pressure_abs: 0.5,
        threshold_flow_pct: 10,
        threshold_flow_abs: 0.5,
      },
      filter_multipliers: payload.filter_multipliers ?? { clean: 1, partially_clogged: 3, clogged: 10 },
      styling: payload.styling ?? { line_color: "#0f766e", line_thickness: 2, symbol_size: 1 },
      visibility: payload.visibility ?? { length: true, diameter: true, pressure: true, flow: true, elevation: true },
      id: schematicId,
      user_id: userId,
      created_at: existing.created_at,
      updated_at: utcNowIso(),
    };

    await SchematicModel.replaceOne({ id: schematicId, user_id: userId }, document).exec();
    return document;
  }

  async delete(userId: string, schematicId: string): Promise<boolean> {
    const result = await SchematicModel.deleteOne({ id: schematicId, user_id: userId }).exec();
    return result.deletedCount === 1;
  }
}
