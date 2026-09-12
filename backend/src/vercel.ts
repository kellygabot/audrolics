import type { Request, Response } from "express";

import { createApp } from "./app.js";
import { connectMongo } from "./config/database.js";

const app = createApp();
let mongoConnection: Promise<void> | null = null;

const ensureMongoConnection = () => {
  mongoConnection ??= connectMongo();
  return mongoConnection;
};

export const vercelHandler = async (request: Request, response: Response) => {
  await ensureMongoConnection();
  return app(request, response);
};
