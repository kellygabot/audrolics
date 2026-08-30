import dotenv from "dotenv";

dotenv.config();

export type AppConfig = {
  port: number;
  mongodbUri: string;
  mongodbDatabase: string;
  frontendOrigins: string[];
};

export const config: AppConfig = {
  port: Number(process.env.PORT ?? 8000),
  mongodbUri: process.env.MONGODB_URI ?? "",
  mongodbDatabase: process.env.MONGODB_DATABASE ?? "audrolics",
  frontendOrigins: (process.env.FRONTEND_ORIGINS ?? "http://localhost:3000,http://localhost:3001")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

export const hasMongoConfig = () => config.mongodbUri.length > 0 && config.mongodbUri !== "{URI}";
