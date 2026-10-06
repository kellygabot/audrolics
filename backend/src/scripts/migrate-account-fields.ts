import { spawn } from "node:child_process";
import { mkdir, chmod, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import mongoose from "mongoose";
import { config } from "../config/env.js";
import { applyAccountMigration, planAccountMigration } from "../migrations/account-fields.js";

const args = process.argv.slice(2);
if (args.some(arg => arg !== "--apply") || args.filter(arg => arg === "--apply").length > 1) throw new Error("Usage: npm run migrate-account-fields -- [--apply]");
if (!config.mongodbUri) throw new Error("MONGODB_URI is required.");
const apply = args.includes("--apply");
await mongoose.connect(config.mongodbUri, { dbName: config.mongodbDatabase, serverSelectionTimeoutMS: 12000 });
try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection unavailable.");
  const users = db.collection("users");
  const plan = await planAccountMigration(users);
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", database: config.mongodbDatabase, total: plan.total, ready: plan.ready, current: plan.current, incomplete: plan.incomplete, conflicts: plan.conflicts }));
  if (!apply) process.exitCode = plan.conflicts ? 2 : 0;
  else {
    if (plan.conflicts) throw new Error("Resolve conflicting account fields before applying.");
    if (!plan.ready) console.log("No account fields require migration.");
    else {
      const backupDir = resolve(process.env.ACCOUNT_MIGRATION_BACKUP_DIR ?? join(tmpdir(), "audrolics-account-backups"));
      await mkdir(backupDir, { recursive: true, mode: 0o700 });
      await chmod(backupDir, 0o700);
      const backup = join(backupDir, `${config.mongodbDatabase}-${new Date().toISOString().replace(/[:.]/g, "-")}.archive.gz`);
      const child = spawn("mongodump", ["--uri", config.mongodbUri, "--db", config.mongodbDatabase, `--archive=${backup}`, "--gzip"], { stdio: ["ignore", "ignore", "pipe"] });
      let error = "";
      child.stderr.on("data", chunk => { error += String(chunk); });
      const code = await new Promise<number | null>((done, reject) => { child.on("error", reject); child.on("close", done); });
      if (code !== 0) throw new Error(`mongodump failed (exit ${code}): ${error.replaceAll(config.mongodbUri, "[redacted]")}`);
      await chmod(backup, 0o600);
      if ((await stat(backup)).size === 0) throw new Error("Backup archive is empty.");
      console.log(`Backup created: ${backup}`);
      const after = await applyAccountMigration(users, plan);
      console.log(JSON.stringify({ verified: true, total: after.total, migrated: plan.ready, incompleteUntouched: after.incomplete, conflicts: after.conflicts }));
    }
  }
} finally { await mongoose.disconnect(); }
