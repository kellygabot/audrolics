import { createApp } from "./app.js";
import { connectMongo } from "./config/database.js";
import { config } from "./config/env.js";

const start = async () => {
  await connectMongo();

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Audrolics MERN API listening on http://127.0.0.1:${config.port}`);
  });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
