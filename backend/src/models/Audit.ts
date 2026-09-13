import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    timestamp: { type: String, required: true },
    user_id: { type: String, required: true },
    schematic_id: { type: String, required: false },
    network_size: { type: Number, required: true },
    status: { type: String, enum: ["SUCCESS", "FAILED"], required: true },
  },
  {
    collection: "audit_logs",
    versionKey: false,
  },
);

auditLogSchema.index({ user_id: 1, timestamp: -1 });
auditLogSchema.index({ schematic_id: 1, timestamp: -1 });

export const AuditLogModel =
  mongoose.models.AuditLog ?? mongoose.model("AuditLog", auditLogSchema);
