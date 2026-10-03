import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

describe("deployment request readiness", () => {
  it("returns a service error while MongoDB is unavailable and accepts a retry", async () => {
    let attempts = 0;
    const app = createApp(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("MongoDB unavailable");
    });

    const health = await request(app).get("/api/health").expect(200);
    expect(health.body).toEqual({ service: "ok" });
    expect(attempts).toBe(0);

    const failed = await request(app).get("/").expect(500);
    expect(failed.body.detail.error_code).toBe("E500");

    const recovered = await request(app).get("/").expect(200);
    expect(recovered.body.status).toBe("ok");
    expect(attempts).toBe(2);
  });
});
