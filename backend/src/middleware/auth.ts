import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { Session } from "../models/Session.js";
import { User, type IUser } from "../models/User.js";
import { ApiError } from "../utils/errors.js";

declare global { namespace Express { interface Request { account?: IUser; sessionId?: string } } }

export const requireAccount: RequestHandler = async (request, _response, next) => {
  try {
    const match = /^Bearer (\S+)$/i.exec(request.header("authorization") ?? "");
    if (!match) throw new ApiError(401, "E401", "Authentication required.");
    let claims: jwt.JwtPayload;
    try {
      const decoded = jwt.verify(match[1], config.jwtSecret, { algorithms: ["HS256"] });
      if (typeof decoded === "string") throw new Error("Invalid token");
      claims = decoded;
    } catch { throw new ApiError(401, "E401", "Invalid or expired access token."); }
    if (typeof claims.sub !== "string" || typeof claims.sid !== "string") throw new ApiError(401, "E401", "Invalid access token.");
    const session = await Session.findById(claims.sid);
    if (!session || session.revokedAt || session.expiresAt <= new Date() || String(session.userId) !== claims.sub) throw new ApiError(401, "E401", "Session expired.");
    const account = await User.findById(claims.sub);
    if (!account || account.deletedAt || account.status !== "ACTIVE") throw new ApiError(401, "E401", "Account unavailable.");
    request.account = account;
    request.sessionId = String(session._id);
    next();
  } catch (error) { next(error); }
};
export const requireRole = (role: "USER" | "ADMIN"): RequestHandler => (request, response, next) => {
  requireAccount(request, response, (error?: unknown) => {
    if (error) return next(error);
    if (request.account?.role !== role) return next(new ApiError(403, "E405", "Insufficient permissions."));
    next();
  });
};
