import { randomBytes, createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User, type IUser } from "../models/User.js";
import { Session } from "../models/Session.js";
import { LoginAttempt } from "../models/LoginAttempt.js";
import { config } from "../config/env.js";
import { ApiError } from "../utils/errors.js";

const DAYS_30 = 30 * 24 * 60 * 60 * 1000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const publicUser = (user: IUser) => ({ id: String(user._id), name: user.name, email: user.email, role: user.role, status: user.status });
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/v1/auth" };
const cookieToken = (request: Request) => (request.header("cookie") ?? "").split(";").map(v => v.trim()).find(v => v.startsWith("audrolics_refresh="))?.slice("audrolics_refresh=".length);
// The session ID is included in the signed claims for immediate revocation.
const issueAccess = (user: IUser, sessionId: string) => jwt.sign({ sid: sessionId }, config.jwtSecret, { algorithm: "HS256", subject: String(user._id), expiresIn: "15m" });
async function issueSession(user: IUser, response: Response) {
  const refresh = randomBytes(48).toString("base64url");
  const session = await Session.create({ userId: user._id, tokenHash: hash(refresh), expiresAt: new Date(Date.now() + DAYS_30) });
  response.cookie("audrolics_refresh", refresh, { ...cookieOptions, maxAge: DAYS_30 });
  return { token: issueAccess(user, String(session._id)), user: publicUser(user) };
}
const wrap = (fn: (request: Request, response: Response) => Promise<void>) => (request: Request, response: Response, next: NextFunction) => { void fn(request, response).catch(next); };
const validEmail = (value: unknown) => typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const validPassword = (value: unknown) => typeof value === "string" && value.length >= 8 && Buffer.byteLength(value, "utf8") <= 72;

export const register = wrap(async (request, response) => {
  const { name, fullName, email, password } = request.body ?? {};
  const displayName = name ?? fullName;
  if (typeof displayName !== "string" || !displayName.trim() || displayName.length > 120 || !validEmail(email) || !validPassword(password)) throw new ApiError(422, "E200", "Valid name, email, and password of 8 to 72 UTF-8 bytes are required.");
  const normalizedEmail = email.trim().toLowerCase();
  if (await User.exists({ email: normalizedEmail })) throw new ApiError(409, "E409", "Email already exists.");
  let user: IUser;
  try { user = await User.create({ name: displayName.trim(), email: normalizedEmail, password: await bcrypt.hash(password, 12), role: "USER" }); }
  catch (error) { if ((error as { code?: number }).code === 11000) throw new ApiError(409, "E409", "Email already exists."); throw error; }
  response.status(201).json(await issueSession(user, response));
});

export const login = wrap(async (request, response) => {
  const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const password = request.body?.password;
  if (!validEmail(email) || typeof password !== "string") throw new ApiError(400, "E200", "Email and password are required.");
  const key = hash(`ip:${request.ip}`);
  const now = new Date();
  const attempts = await LoginAttempt.findOne({ key });
  const withinWindow = !!attempts && attempts.windowStart.getTime() + 60_000 > now.getTime();
  if (withinWindow && attempts!.count >= 5) throw new ApiError(429, "E429", "Too many login attempts. Try again later.");
  if (withinWindow) await LoginAttempt.updateOne({ key }, { $inc: { count: 1 } });
  else await LoginAttempt.findOneAndUpdate({ key }, { $set: { count: 1, windowStart: now, expiresAt: new Date(now.getTime() + 60_000) } }, { upsert: true });
  const user = await User.findOne({ email });
  if (user?.lockedUntil && user.lockedUntil > now) throw new ApiError(423, "E423", "Account temporarily locked.");
  const good = user && await bcrypt.compare(password, user.password);
  if (!good) {
    if (user) { user.failedLogins += 1; if (user.failedLogins >= 10) { user.lockedUntil = new Date(now.getTime() + 15 * 60_000); user.failedLogins = 0; } await user.save(); }
    throw new ApiError(401, "E401", "Invalid email or password.");
  }
  if (user.deletedAt || user.status !== "ACTIVE") throw new ApiError(403, "E403", "Account unavailable.");
  user.failedLogins = 0; user.lockedUntil = null; await user.save();
  response.json(await issueSession(user, response));
});

export const refresh = wrap(async (request, response) => {
  const token = cookieToken(request);
  if (!token) throw new ApiError(401, "E401", "Refresh cookie required.");
  const replacement = randomBytes(48).toString("base64url");
  const session = await Session.findOneAndUpdate({ tokenHash: hash(token), revokedAt: null, expiresAt: { $gt: new Date() } }, { $set: { tokenHash: hash(replacement), expiresAt: new Date(Date.now() + DAYS_30) } }, { new: true });
  if (!session) throw new ApiError(401, "E401", "Session expired.");
  const user = await User.findById(session.userId);
  if (!user || user.deletedAt || user.status !== "ACTIVE") { await Session.updateOne({ _id: session._id }, { revokedAt: new Date() }); throw new ApiError(401, "E401", "Account unavailable."); }
  response.cookie("audrolics_refresh", replacement, { ...cookieOptions, maxAge: DAYS_30 });
  response.json({ token: issueAccess(user, String(session._id)), user: publicUser(user) });
});

export const logout = wrap(async (request, response) => {
  const token = cookieToken(request);
  if (token) await Session.updateOne({ tokenHash: hash(token) }, { revokedAt: new Date() });
  const bearer = /^Bearer (\S+)$/i.exec(request.header("authorization") ?? "")?.[1];
  if (bearer) {
    try {
      const claims = jwt.verify(bearer, config.jwtSecret, { algorithms: ["HS256"] });
      if (typeof claims !== "string" && claims.sid && claims.sub) await Session.updateOne({ _id: claims.sid, userId: claims.sub }, { revokedAt: new Date() });
    } catch { /* An expired access token can still log out through its refresh cookie. */ }
  }
  response.clearCookie("audrolics_refresh", cookieOptions);
  response.status(204).send();
});
export const currentUser = wrap(async (request, response) => { response.json({ user: publicUser(request.account!) }); });
