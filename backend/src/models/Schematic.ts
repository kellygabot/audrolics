import mongoose from "mongoose";

const flexibleSchema = new mongoose.Schema({}, { _id: false, strict: false });

const schematicSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    user_id: { type: String, required: true },
    name: { type: String, required: true },
    nodes: { type: [flexibleSchema], default: [] },
    links: { type: [flexibleSchema], default: [] },
    measurements: { type: [flexibleSchema], default: [] },
    canvas_state: { type: flexibleSchema, default: () => ({ zoom: 100, pan: { x: 0, y: 0 } }) },
    thresholds: { type: flexibleSchema, default: () => ({}) },
    filter_multipliers: { type: flexibleSchema, default: () => ({}) },
    styling: { type: flexibleSchema, default: () => ({}) },
    visibility: { type: flexibleSchema, default: () => ({}) },
    created_at: { type: String, required: true },
    updated_at: { type: String, required: true },
  },
  {
    collection: "schematics",
    versionKey: false,
  },
);

schematicSchema.index({ user_id: 1, updated_at: -1 });
schematicSchema.index({ id: 1, user_id: 1 }, { unique: true });

// This Mongoose model intentionally stores the same document shape used by the
// Next.js builder's schematic API contract.
export const SchematicModel =
  mongoose.models.Schematic ?? mongoose.model("Schematic", schematicSchema);
