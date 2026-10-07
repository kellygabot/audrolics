import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyAccountMigration, planAccountMigration } from "../src/migrations/account-fields.js";

const uri = process.env.TEST_MIGRATION_MONGODB_URI;
const suite = uri ? describe : describe.skip;

suite("account field migration", () => {
  beforeAll(async () => {
    if (!uri || !new URL(uri).pathname.includes("audrolics_migration_test")) throw new Error("Use a dedicated audrolics_migration_test database.");
    await mongoose.connect(uri);
  });
  beforeEach(async () => { await mongoose.connection.db!.collection("users").deleteMany({}); });
  afterAll(async () => { await mongoose.disconnect(); });

  it("dry runs, applies without changing IDs or hashes, and repeats safely while leaving incomplete data", async () => {
    const users = mongoose.connection.db!.collection("users");
    const hash = await bcrypt.hash("Password123!", 12);
    const old = await users.insertOne({ name: "Alice", email: "alice@example.com", password: hash, role: "USER" });
    await users.insertOne({ email: "incomplete@example.com", role: "USER" });
    const before = await planAccountMigration(users);
    expect({ total: before.total, ready: before.ready, incomplete: before.incomplete, conflicts: before.conflicts }).toEqual({ total: 2, ready: 1, incomplete: 1, conflicts: 0 });
    expect((await users.findOne({ _id: old.insertedId }))?.name).toBe("Alice");
    const after = await applyAccountMigration(users, before);
    expect({ ready: after.ready, current: after.current, incomplete: after.incomplete }).toEqual({ ready: 0, current: 1, incomplete: 1 });
    expect(await users.findOne({ _id: old.insertedId })).toMatchObject({ fullName: "Alice", passwordHash: hash });
    expect(await users.findOne({ email: "incomplete@example.com" })).not.toHaveProperty("fullName");
    expect((await planAccountMigration(users)).ready).toBe(0);
    await applyAccountMigration(users, await planAccountMigration(users));
  });

  it("stops before writes when old and new fields conflict", async () => {
    const users = mongoose.connection.db!.collection("users");
    const hash = await bcrypt.hash("Password123!", 12);
    await users.insertMany([{ name: "Alice", fullName: "Other", email: "one@example.com", password: hash }, { name: "Bob", email: "two@example.com", password: hash }]);
    const plan = await planAccountMigration(users);
    expect(plan.conflicts).toBe(1);
    await expect(applyAccountMigration(users, plan)).rejects.toThrow("conflict");
    expect((await users.findOne({ email: "two@example.com" }))?.name).toBe("Bob");
  });
});
