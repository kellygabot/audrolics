import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("JWT configuration", () => {
  it("fails at startup with a clear message when the secret is missing", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", "await import('./src/config/env.ts')"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, JWT_SECRET: "", NODE_ENV: "development" },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("JWT_SECRET must be configured");
    expect(result.stderr).not.toContain("secretOrPrivateKey must have a value");
  });

  it("starts with a configured secret", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", "await import('./src/config/env.ts')"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, JWT_SECRET: "a-test-secret-longer-than-thirty-two-characters", NODE_ENV: "development" },
    });
    expect(result.status).toBe(0);
  });
});
