import mongoose from "mongoose";

import { config, hasMongoConfig } from "./env.js";

export const connectMongo = async () => {
  if (!hasMongoConfig()) {
    throw new Error("MONGODB_URI is required for the MERN backend.");
  }

  await mongoose.connect(config.mongodbUri, {
    dbName: config.mongodbDatabase,
  });
};

export const disconnectMongo = async () => {
  await mongoose.disconnect();
};
