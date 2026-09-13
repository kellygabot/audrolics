import { AuditLogModel } from "../models/Audit.js";
import type { AuditLogEntry } from "../types.js";

export class AuditLogRepository {
  async insert(entry: AuditLogEntry): Promise<void> {
    await AuditLogModel.create(entry);
  }
}
