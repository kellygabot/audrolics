import { createApp } from "./app.js";
import { connectMongo } from "./config/database.js";

let connection: Promise<void> | null = null;

const ensureMongoConnection = () => {
  connection ??= connectMongo().catch((error) => {
    // A failed connection may be retried by a later request on this instance.
    connection = null;
    throw error;
  });
  return connection;
};

// The default Express export is the entrypoint for the Vercel backend service.
const app = createApp(ensureMongoConnection);

export default app;
