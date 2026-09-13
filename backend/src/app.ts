import cors from "cors";
import express from "express";

import { config } from "./config/env.js";
import { anomaliesRouter } from "./routes/anomalies.js";
import { schematicsRouter } from "./routes/schematics.js";
import { simulationRouter } from "./routes/simulation.js";
import { errorHandler } from "./utils/errors.js";

export const createApp = () => {
  const app = express();

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
  app.use("/api/v1/schematics", schematicsRouter);
  app.use("/api/v1/simulate", simulationRouter);
  app.use("/api/v1/anomalies", anomaliesRouter);

  app.use(errorHandler);

  return app;
};
