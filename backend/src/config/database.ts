import mongoose from "mongoose";

import { config, hasMongoConfig } from "./env.js";

export const connectMongo = async () => {
  if (!hasMongoConfig()) {
    throw new Error("MONGODB_URI is required for the backend.");
  }

  try {
    await mongoose.connect(config.mongodbUri, {
      dbName: config.mongodbDatabase,
      serverSelectionTimeoutMS: 5000,
    });
  } catch (error) {
    const isLocalUri = config.mongodbUri.includes("127.0.0.1") || config.mongodbUri.includes("localhost");
    if (process.env.NODE_ENV !== "production" && !isLocalUri) {
      const localUri = `mongodb://127.0.0.1:27017/${config.mongodbDatabase}`;
      console.warn(
        `Failed to connect to primary MongoDB (${(error as Error).message}). Falling back to local MongoDB at ${localUri}...`,
      );
      try {
        await mongoose.connect(localUri, {
          serverSelectionTimeoutMS: 3000,
        });
        console.log(`Connected to local MongoDB (${localUri})`);
        return;
      } catch (localError) {
        console.error("Local MongoDB fallback also failed:", (localError as Error).message);
      }
    }
    throw error;
  }
};

export const disconnectMongo = async () => {
  await mongoose.disconnect();
};

