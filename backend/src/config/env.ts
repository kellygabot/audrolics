import dotenv from "dotenv";

dotenv.config();

export type AppConfig = {
  port: number;
  mongodbUri: string;
  mongodbDatabase: string;
  frontendOrigins: string[];
  jwtSecret: string;
};

export const config: AppConfig = {
  port: Number(process.env.PORT ?? 8000),
  mongodbUri: process.env.MONGODB_URI ?? "",
  mongodbDatabase: process.env.MONGODB_DATABASE ?? "audrolics",
  frontendOrigins: (process.env.FRONTEND_ORIGINS ?? "http://localhost:3000,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET ?? "default_jwt_secret_change_in_production",
};

export const hasMongoConfig = () => config.mongodbUri.length > 0;