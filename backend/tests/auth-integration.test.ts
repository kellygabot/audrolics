import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Session } from "../src/models/Session.js";
import { LoginAttempt } from "../src/models/LoginAttempt.js";
import { SchematicModel } from "../src/models/Schematic.js";
import { AuditLogModel } from "../src/models/Audit.js";
import { applyAccountMigration, planAccountMigration } from "../src/migrations/account-fields.js";

const uri = process.env.TEST_MONGODB_URI;
const suite = uri ? describe : describe.skip;
const app = createApp();
const password = "Password123!";
const register = (email: string, role = "USER") => request(app).post("/api/v1/auth/register").send({ fullName: email.split("@")[0], email, password, acceptedPolicies: true, role });
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const cookie = (response: { headers: Record<string, string[] | string | undefined> }) => String(response.headers["set-cookie"]?.[0] ?? "").split(";")[0];

suite("MongoDB authentication and ownership", () => {
  beforeAll(async () => {
    if (!uri || !new URL(uri).pathname.includes("audrolics_auth_test")) throw new Error("Use a dedicated audrolics_auth_test database.");
    await mongoose.connect(uri);
    await Promise.all([User.init(), Session.init(), LoginAttempt.init(), SchematicModel.init(), AuditLogModel.init()]);
  });
  beforeEach(async () => { await Promise.all([User.deleteMany({}), Session.deleteMany({}), LoginAttempt.deleteMany({}), SchematicModel.deleteMany({}), AuditLogModel.deleteMany({})]); });
  afterAll(async () => { await mongoose.disconnect(); });

  it("registers only USER, rotates refresh tokens, and revokes logout", async () => {
    const signedUp = await register("alice@example.com", "ADMIN").expect(201);
    expect(signedUp.body.user.role).toBe("USER");
    expect(signedUp.body.user).toEqual({ id: expect.any(String), fullName: "alice", email: "alice@example.com", role: "USER" });
    expect(signedUp.body.token).toBeTruthy();
    expect(await bcrypt.compare(password, (await User.findOne({ email: "alice@example.com" }))!.passwordHash)).toBe(true);
    expect((await request(app).get("/api/v1/auth/me").set(bearer(signedUp.body.token)).expect(200)).body.user).toEqual(signedUp.body.user);
    const session = await Session.findOne({ userId: signedUp.body.user.id });
    expect(session!.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    const firstCookie = cookie(signedUp);
    await Session.updateOne({ _id: session!._id }, { expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    const refreshed = await request(app).post("/api/v1/auth/refresh").set("Cookie", firstCookie).expect(200);
    expect(cookie(refreshed)).not.toBe(firstCookie);
    expect((await Session.findById(session!._id))!.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    await request(app).post("/api/v1/auth/refresh").set("Cookie", firstCookie).expect(401);
    await request(app).post("/api/v1/auth/logout").set("Cookie", cookie(refreshed)).expect(204);
    await request(app).get("/api/v1/auth/me").set(bearer(refreshed.body.token)).expect(401);
    await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie(refreshed)).expect(401);
  });

  it("requires the draft policy acknowledgment and rejects the old name alias", async () => {
    const base = { fullName: "Alice", email: "alice@example.com", password };
    await request(app).post("/api/v1/auth/register").send(base).expect(422);
    await request(app).post("/api/v1/auth/register").send({ ...base, acceptedPolicies: false }).expect(422);
    await request(app).post("/api/v1/auth/register").send({ name: "Alice", email: base.email, password, acceptedPolicies: true }).expect(422);
    expect(await User.countDocuments()).toBe(0);
  });

  it("logs in with an existing bcrypt hash after migration", async () => {
    const users = mongoose.connection.db!.collection("users");
    const passwordHash = await bcrypt.hash(password, 12);
    await users.insertOne({ name: "Legacy User", email: "legacy@example.com", password: passwordHash, role: "USER", status: "ACTIVE", deletedAt: null, failedLogins: 0, lockedUntil: null });
    await applyAccountMigration(users, await planAccountMigration(users));
    const loggedIn = await request(app).post("/api/v1/auth/login").send({ email: "legacy@example.com", password }).expect(200);
    expect(loggedIn.body.user.fullName).toBe("Legacy User");
    expect((await users.findOne({ email: "legacy@example.com" }))?.passwordHash).toBe(passwordHash);
  });

  it("expires after inactivity and rejects suspended or deleted accounts", async () => {
    const signedUp = await register("alice@example.com").expect(201);
    await Session.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    await request(app).get("/api/v1/auth/me").set(bearer(signedUp.body.token)).expect(401);
    await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie(signedUp)).expect(401);
    const account = await User.findOne({ email: "alice@example.com" });
    account!.status = "SUSPENDED"; await account!.save();
    await request(app).post("/api/v1/auth/login").send({ email: account!.email, password }).expect(403);
    account!.status = "ACTIVE"; account!.deletedAt = new Date(); await account!.save();
    await request(app).post("/api/v1/auth/login").send({ email: account!.email, password }).expect(403);
  });

  it("limits login by IP and locks accounts after repeated failures", async () => {
    await register("alice@example.com").expect(201);
    for (let i = 0; i < 5; i++) await request(app).post("/api/v1/auth/login").send({ email: "alice@example.com", password: "wrong" }).expect(401);
    await request(app).post("/api/v1/auth/login").send({ email: "other@example.com", password }).expect(429);
    await LoginAttempt.deleteMany({});
    for (let i = 0; i < 5; i++) await request(app).post("/api/v1/auth/login").send({ email: "alice@example.com", password: "wrong" }).expect(401);
    await LoginAttempt.deleteMany({});
    await request(app).post("/api/v1/auth/login").send({ email: "alice@example.com", password }).expect(423);
  });

  it("isolates all schematic CRUD and saved analyses, with admin moderation", async () => {
    const alice = await register("alice@example.com").expect(201);
    const bob = await register("bob@example.com").expect(201);
    const admin = await User.create({ fullName: "Admin", email: "admin@example.com", passwordHash: await bcrypt.hash(password, 12), role: "ADMIN" });
    const adminLogin = await request(app).post("/api/v1/auth/login").send({ email: admin.email, password }).expect(200);
    await request(app).get("/api/v1/schematics").set("X-User-Id", alice.body.user.id).expect(401);
    await request(app).post("/api/v1/simulate").send({}).expect(401);
    await request(app).post("/api/v1/anomalies").send({}).expect(401);
    const created = await request(app).post("/api/v1/schematics").set(bearer(alice.body.token)).send({ name: "A", nodes: [], links: [] }).expect(201);
    const id = created.body.id;
    expect((await request(app).get("/api/v1/schematics").set(bearer(bob.body.token)).expect(200)).body).toEqual([]);
    await request(app).get(`/api/v1/schematics/${id}`).set(bearer(bob.body.token)).expect(404);
    await request(app).put(`/api/v1/schematics/${id}`).set(bearer(bob.body.token)).send({ name: "B", nodes: [], links: [] }).expect(404);
    await request(app).delete(`/api/v1/schematics/${id}`).set(bearer(bob.body.token)).expect(404);
    await request(app).post("/api/v1/simulate").set(bearer(bob.body.token)).send({ schematic_id: id }).expect(404);
    await request(app).post("/api/v1/anomalies").set(bearer(bob.body.token)).send({ schematic_id: id, measurements: [{ element_id: "x", type: "FLOW_RATE", value: 1 }] }).expect(404);
    await request(app).get("/api/v1/admin/users").set(bearer(alice.body.token)).expect(403);
    await request(app).get("/api/v1/schematics").set(bearer(adminLogin.body.token)).expect(403);
    const people = await request(app).get("/api/v1/admin/users").set(bearer(adminLogin.body.token)).expect(200);
    expect(people.body).toHaveLength(2);
    await request(app).delete(`/api/v1/admin/users/${admin.id}`).set(bearer(adminLogin.body.token)).expect(404);
    await request(app).patch(`/api/v1/admin/users/${admin.id}`).set(bearer(adminLogin.body.token)).send({ fullName: "No", email: "no@example.com" }).expect(404);
    const createdUser = await request(app).post("/api/v1/admin/users").set(bearer(adminLogin.body.token)).send({ fullName: "Carol", email: "carol@example.com", password }).expect(201);
    expect(createdUser.body.role).toBe("USER");
    expect(createdUser.body.passwordHash).toBeUndefined();
    expect(createdUser.body).toEqual({ id: expect.any(String), fullName: "Carol", email: "carol@example.com", role: "USER", status: "ACTIVE", deletedAt: null });
    await request(app).patch(`/api/v1/admin/users/${createdUser.body.id}`).set(bearer(adminLogin.body.token)).send({ fullName: "Carol B", email: "carol.b@example.com" }).expect(200);
    await request(app).patch(`/api/v1/admin/users/${bob.body.user.id}/status`).set(bearer(adminLogin.body.token)).send({ status: "SUSPENDED" }).expect(200);
    await request(app).get("/api/v1/schematics").set(bearer(bob.body.token)).expect(401);
    await request(app).patch(`/api/v1/admin/users/${bob.body.user.id}/status`).set(bearer(adminLogin.body.token)).send({ status: "ACTIVE" }).expect(200);
    const metadata = await request(app).get("/api/v1/admin/schematics").set(bearer(adminLogin.body.token)).expect(200);
    expect(metadata.body[0].id).toBe(id);
    expect(metadata.body[0].nodes).toBeUndefined();
    await request(app).delete(`/api/v1/admin/schematics/${id}`).set(bearer(adminLogin.body.token)).expect(200);
    await request(app).get(`/api/v1/schematics/${id}`).set(bearer(alice.body.token)).expect(404);
    await request(app).post(`/api/v1/admin/schematics/${id}/restore`).set(bearer(adminLogin.body.token)).expect(200);
    await request(app).get(`/api/v1/schematics/${id}`).set(bearer(alice.body.token)).expect(200);
    await request(app).delete(`/api/v1/admin/users/${alice.body.user.id}`).set(bearer(adminLogin.body.token)).expect(200);
    await request(app).get(`/api/v1/schematics/${id}`).set(bearer(alice.body.token)).expect(401);
    await request(app).post(`/api/v1/admin/users/${alice.body.user.id}/restore`).set(bearer(adminLogin.body.token)).expect(200);
    const aliceAgain = await request(app).post("/api/v1/auth/login").send({ email: "alice@example.com", password }).expect(200);
    await request(app).get(`/api/v1/schematics/${id}`).set(bearer(aliceAgain.body.token)).expect(200);
  });

  it("shows paginated simulation audit metadata only to admins", async () => {
    const user = await register("alice@example.com").expect(201);
    const admin = await User.create({ fullName: "Admin", email: "admin@example.com", passwordHash: await bcrypt.hash(password, 12), role: "ADMIN" });
    const adminLogin = await request(app).post("/api/v1/auth/login").send({ email: admin.email, password }).expect(200);
    await AuditLogModel.create({ timestamp: "2026-01-02T00:00:00.000Z", user_id: user.body.user.id, schematic_id: "diagram-1", network_size: 3, status: "FAILED", error_code: "E200" });
    await AuditLogModel.create({ timestamp: "2026-01-01T00:00:00.000Z", user_id: user.body.user.id, network_size: 2, status: "SUCCESS" });

    await request(app).get("/api/v1/admin/audit-logs").expect(401);
    await request(app).get("/api/v1/admin/audit-logs").set(bearer(user.body.token)).expect(403);
    const response = await request(app).get("/api/v1/admin/audit-logs?status=FAILED&page=1").set(bearer(adminLogin.body.token)).expect(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items).toEqual([{ id: expect.any(String), timestamp: "2026-01-02T00:00:00.000Z", user_id: user.body.user.id, schematic_id: "diagram-1", network_size: 3, status: "FAILED", error_code: "E200" }]);
    await request(app).get("/api/v1/admin/audit-logs?page=0").set(bearer(adminLogin.body.token)).expect(422);
  });
});
