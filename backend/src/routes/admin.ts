import { Router } from "express";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { User } from "../models/User.js";
import { Session } from "../models/Session.js";
import { SchematicModel } from "../models/Schematic.js";
import { AuditLogModel } from "../models/Audit.js";
import { ApiError } from "../utils/errors.js";

export const adminRouter = Router();
adminRouter.get("/audit-logs", async (req, res, next) => { try {
  const page = Number(req.query.page ?? 1);
  const status = req.query.status;
  const userId = req.query.userId;
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 ||
      (status !== undefined && !["SUCCESS", "FAILED", "NON_CONVERGENCE"].includes(String(status))) ||
      (userId !== undefined && (typeof userId !== "string" || !Types.ObjectId.isValid(userId)))) {
    throw new ApiError(422, "E200", "Invalid audit log filter or page.");
  }
  const filter = {
    ...(status ? { status } : {}),
    ...(userId ? { user_id: userId } : {}),
  };
  const pageSize = 25;
  const [items, total] = await Promise.all([
    AuditLogModel.find(filter).select({ timestamp: 1, user_id: 1, schematic_id: 1, network_size: 1, status: 1, error_code: 1 })
      .sort({ timestamp: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    AuditLogModel.countDocuments(filter),
  ]);
  res.json({ items: items.map(({ _id, ...entry }) => ({ id: String(_id), ...entry })), total, page, pageSize });
} catch (e) { next(e); } });
const managedUser = (user: { _id: unknown; fullName: string; email: string; role: string; status: string; deletedAt: Date | null }) => ({ id: String(user._id), fullName: user.fullName, email: user.email, role: user.role, status: user.status, deletedAt: user.deletedAt });
const validId = (id: string) => { if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "E404", "User not found."); return id; };
const userFilter = (id: string) => ({ _id: validId(id), role: "USER" });
const bodyNameEmail = (body: Record<string, unknown>) => {
  if (typeof body.fullName !== "string" || !body.fullName.trim() || body.fullName.length > 120 || typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw new ApiError(422, "E200", "Valid fullName and email required.");
  return { fullName: body.fullName.trim(), email: body.email.trim().toLowerCase() };
};
const sendError = (next: (error: unknown) => void, error: unknown) => next((error as { code?: number }).code === 11000 ? new ApiError(409, "E409", "Email already exists.") : error);
adminRouter.get("/users", async (_req, res, next) => { try { res.json((await User.find({ role: "USER" }).sort({ createdAt: -1 })).map(managedUser)); } catch (e) { next(e); } });
adminRouter.post("/users", async (req, res, next) => { try {
  const fields = bodyNameEmail(req.body ?? {});
  if (typeof req.body.password !== "string" || req.body.password.length < 8 || Buffer.byteLength(req.body.password, "utf8") > 72) throw new ApiError(422, "E200", "Password must have 8 to 72 UTF-8 bytes.");
  const user = await User.create({ ...fields, passwordHash: await bcrypt.hash(req.body.password, 12), role: "USER" });
  res.status(201).json(managedUser(user));
} catch (e) { sendError(next, e); } });
adminRouter.get("/users/:id", async (req, res, next) => { try { const user = await User.findOne(userFilter(req.params.id)); if (!user) throw new ApiError(404, "E404", "User not found."); res.json(managedUser(user)); } catch (e) { next(e); } });
adminRouter.patch("/users/:id", async (req, res, next) => { try {
  const updates = bodyNameEmail(req.body ?? {});
  const user = await User.findOneAndUpdate(userFilter(req.params.id), { $set: updates }, { new: true });
  if (!user) throw new ApiError(404, "E404", "User not found."); res.json(managedUser(user));
} catch (e) { sendError(next, e); } });
adminRouter.patch("/users/:id/status", async (req, res, next) => { try {
  if (req.body?.status !== "ACTIVE" && req.body?.status !== "SUSPENDED") throw new ApiError(422, "E200", "Invalid status.");
  const user = await User.findOneAndUpdate(userFilter(req.params.id), { $set: { status: req.body.status } }, { new: true });
  if (!user) throw new ApiError(404, "E404", "User not found.");
  if (user.status === "SUSPENDED") await Session.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
  res.json(managedUser(user));
} catch (e) { next(e); } });
adminRouter.delete("/users/:id", async (req, res, next) => { try {
  const user = await User.findOneAndUpdate({ ...userFilter(req.params.id), deletedAt: null }, { deletedAt: new Date() }, { new: true });
  if (!user) throw new ApiError(404, "E404", "User not found.");
  await Session.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() }); res.json(managedUser(user));
} catch (e) { next(e); } });
adminRouter.post("/users/:id/restore", async (req, res, next) => { try {
  const user = await User.findOneAndUpdate(userFilter(req.params.id), { deletedAt: null }, { new: true });
  if (!user) throw new ApiError(404, "E404", "User not found."); res.json(managedUser(user));
} catch (e) { next(e); } });
const regularUserIds = async () => (await User.find({ role: "USER" }).select({ _id: 1 }).lean()).map(user => String(user._id));
adminRouter.get("/schematics", async (req, res, next) => { try {
  const ids = await regularUserIds();
  const filter = typeof req.query.userId === "string" ? { user_id: { $in: ids.filter(id => id === req.query.userId) } } : { user_id: { $in: ids } };
  res.json(await SchematicModel.find(filter).select({ _id: 0, id: 1, user_id: 1, name: 1, created_at: 1, updated_at: 1, deleted_at: 1 }).sort({ updated_at: -1 }).lean());
} catch (e) { next(e); } });
adminRouter.delete("/schematics/:id", async (req, res, next) => { try {
  const result = await SchematicModel.findOneAndUpdate({ id: req.params.id, user_id: { $in: await regularUserIds() }, deleted_at: null }, { deleted_at: new Date().toISOString() }, { new: true }).select({ id: 1, deleted_at: 1, _id: 0 }).lean();
  if (!result) throw new ApiError(404, "E404", "Schematic not found."); res.json(result);
} catch (e) { next(e); } });
adminRouter.post("/schematics/:id/restore", async (req, res, next) => { try {
  const result = await SchematicModel.findOneAndUpdate({ id: req.params.id, user_id: { $in: await regularUserIds() }, deleted_at: { $ne: null } }, { deleted_at: null }, { new: true }).select({ id: 1, deleted_at: 1, _id: 0 }).lean();
  if (!result) throw new ApiError(404, "E404", "Schematic not found."); res.json(result);
} catch (e) { next(e); } });
