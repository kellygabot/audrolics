import { createHash } from "node:crypto";
import type { Collection, Document, Filter, ObjectId } from "mongodb";

type Account = Document & { _id: ObjectId; name?: unknown; fullName?: unknown; password?: unknown; passwordHash?: unknown };
type Change = { account: Account; fullName: string; passwordHash: string };
export type MigrationPlan = { total: number; ready: number; current: number; incomplete: number; conflicts: number; changes: Change[] };

const validName = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 120;
const validHash = (value: unknown): value is string => typeof value === "string" && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function planAccountMigration(collection: Collection<Document>): Promise<MigrationPlan> {
  const accounts = await collection.find<Account>({}).toArray();
  const plan: MigrationPlan = { total: accounts.length, ready: 0, current: 0, incomplete: 0, conflicts: 0, changes: [] };
  for (const account of accounts) {
    if ((account.name !== undefined && account.fullName !== undefined && account.name !== account.fullName) ||
        (account.password !== undefined && account.passwordHash !== undefined && account.password !== account.passwordHash)) {
      plan.conflicts++;
      continue;
    }
    const fullName = account.fullName ?? account.name;
    const passwordHash = account.passwordHash ?? account.password;
    if (!validName(fullName) || !validHash(passwordHash) || typeof account.email !== "string" || !account.email.trim()) {
      plan.incomplete++;
      continue;
    }
    if (account.name === undefined && account.password === undefined) { plan.current++; continue; }
    plan.ready++;
    plan.changes.push({ account, fullName, passwordHash });
  }
  return plan;
}

export async function applyAccountMigration(collection: Collection<Document>, plan: MigrationPlan) {
  if (plan.conflicts) throw new Error(`Migration stopped: ${plan.conflicts} account field conflict(s).`);
  for (const { account, fullName, passwordHash } of plan.changes) {
    const filter: Filter<Document> = { _id: account._id, name: account.name === undefined ? { $exists: false } : account.name,
      fullName: account.fullName === undefined ? { $exists: false } : account.fullName,
      password: account.password === undefined ? { $exists: false } : account.password,
      passwordHash: account.passwordHash === undefined ? { $exists: false } : account.passwordHash };
    const result = await collection.updateOne(filter, { $set: { fullName, passwordHash }, $unset: { name: "", password: "" } });
    if (result.matchedCount !== 1) throw new Error("Account changed during migration; restore from backup or inspect before retrying.");
  }
  const after = await planAccountMigration(collection);
  if (after.total !== plan.total || after.ready !== 0 || after.conflicts !== 0 || after.incomplete !== plan.incomplete) throw new Error("Post-migration account counts differ from preflight.");
  for (const { account, passwordHash } of plan.changes) {
    const migrated = await collection.findOne({ _id: account._id }, { projection: { name: 1, fullName: 1, password: 1, passwordHash: 1 } });
    if (!migrated || "name" in migrated || "password" in migrated || migrated.fullName !== (account.fullName ?? account.name) || digest(String(migrated.passwordHash)) !== digest(passwordHash)) throw new Error("Post-migration field or hash verification failed.");
  }
  return after;
}
