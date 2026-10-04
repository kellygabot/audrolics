import cors from "cors";
import express from "express";

import { config } from "./config/env.js";
import authRoutes from "./routes/authRoutes.js";
import { anomaliesRouter } from "./routes/anomalies.js";
import { schematicsRouter } from "./routes/schematics.js";
import { simulationRouter } from "./routes/simulation.js";
import { requireRole } from "./middleware/auth.js";
import { adminRouter } from "./routes/admin.js";
import { errorHandler } from "./utils/errors.js";

export const createApp = (ensureReady?: () => Promise<void>) => {
  const app = express();
  app.set("trust proxy", 1);

  // This checks that Vercel reached Express even when MongoDB is unavailable.
  app.get("/api/health", (_request, response) => {
    response.json({ service: "ok" });
  });

  // Vercel starts a new function instance on demand. Wait for MongoDB before
  // routing requests so a cold start cannot query through a disconnected model.
  if (ensureReady) {
    app.use(async (_request, _response, next) => {
      try {
        await ensureReady();
        next();
      } catch (error) {
        console.error("Backend database readiness failed:", error);
        next(error);
      }
    });
  }

  app.use(
    cors({
      origin: config.frontendOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));

  app.get("/", (_request, response) => {
    response.json({ name: "Audrolics API", status: "ok" });
  });

  // Frontend contract:
  // keep this mounted path stable because the Next.js builder rewrites
  // same-origin /api/* requests to this Express backend.
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/schematics", requireRole("USER"), schematicsRouter);
  app.use("/api/v1/simulate", requireRole("USER"), simulationRouter);
  app.use("/api/v1/anomalies", requireRole("USER"), anomaliesRouter);
  app.use("/api/v1/admin", requireRole("ADMIN"), adminRouter);

  app.use(errorHandler);

  return app;
};