import bcrypt from "bcryptjs";
import { connectMongo, disconnectMongo } from "../config/database.js";
import { User } from "../models/User.js";

const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password || password.length < 12) throw new Error("Usage: npm run seed-admin -- 'Name' email@example.com 'password-at-least-12-chars'");
await connectMongo();
try {
  if (await User.exists({ role: "ADMIN" })) throw new Error("Admin already exists.");
  await User.create({ name, email: email.toLowerCase(), password: await bcrypt.hash(password, 12), role: "ADMIN" });
  console.log("Admin created.");
} finally { await disconnectMongo(); }
