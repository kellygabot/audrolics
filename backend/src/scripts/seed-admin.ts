import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { config } from "../config/env.js";
import { User } from "../models/User.js";

const [rawName, rawEmail, suppliedPassword] = process.argv.slice(2);
const name = rawName?.trim();
const email = rawEmail?.trim().toLowerCase();
const password = suppliedPassword ?? randomBytes(24).toString("base64url");

if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
  throw new Error("Usage: npm run seed-admin -- 'Name' email@example.com [password-of-12-to-72-bytes]");
}
if (!config.mongodbUri) throw new Error("MONGODB_URI is required to seed the admin.");

await mongoose.connect(config.mongodbUri, {
  dbName: config.mongodbDatabase,
  serverSelectionTimeoutMS: 5000,
});
try {
  await User.init();
  if (await User.exists({ role: "ADMIN" })) throw new Error("Admin already exists.");
  if (await User.exists({ email })) throw new Error("That email already belongs to an account.");
  await User.create({ fullName: name, email, passwordHash: await bcrypt.hash(password, 12), role: "ADMIN" });
  console.log(`Admin created: ${email}`);
  if (!suppliedPassword) console.log(`Temporary password: ${password}`);
} finally {
  await mongoose.disconnect();
}
