import { createApp } from "./app.js";
import { connectMongo } from "./config/database.js";
import { config } from "./config/env.js";

const start = async () => {
  try {
    await connectMongo();
  } catch (error) {
    console.error("Database connection warning:", (error as Error).message);
    console.error("The API server will continue running. Ensure MongoDB is running or your IP is whitelisted in MongoDB Atlas.");
  }

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Audrolics API listening on http://127.0.0.1:${config.port}`);
  });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
