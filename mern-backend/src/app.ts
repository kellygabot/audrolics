import cors from "cors";
import express from "express";

import { config } from "./config/env.js";
import { schematicsRouter } from "./routes/schematics.js";
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
    response.json({ name: "Audrolics MERN API", status: "ok" });
  });

  // Interchange point with the FastAPI/FARM backend:
  // keep this mounted path and response shape equal to backend/src/backend/main.py.
  // The Next.js frontend only needs BACKEND_API_BASE_URL to point at whichever
  // backend implementation is running.
  app.use("/api/v1/schematics", schematicsRouter);

  app.use(errorHandler);

  return app;
};
