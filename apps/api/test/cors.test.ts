import { describe, expect, test } from "bun:test";

import { createTestApp } from "../src/app";
import { buildAllowedOrigins, resolveCors } from "../src/http/cors";
import type { RateLimiter } from "../src/rate-limit/rate-limiter";
import { testAppConfig } from "./test-config";

const PUBLIC_ORIGIN = "http://localhost:3000"; // testAppConfig.publicAppUrl
const ADMIN_ORIGIN = "http://localhost:3001"; // testAppConfig.adminAppUrl

function createRequest(method: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/healthz", { method, headers });
}

function createPermissiveRateLimiter(): RateLimiter {
  return { async checkAndIncrement() {} };
}

function createAppForCors() {
  return createTestApp({
    config: testAppConfig,
    rateLimiter: createPermissiveRateLimiter(),
    checkDatabase: async () => true,
  });
}

describe("resolveCors", () => {
  const allowed = buildAllowedOrigins(testAppConfig);

  test("derives the allowlist from the configured public and admin app URLs", () => {
    expect(allowed.has(PUBLIC_ORIGIN)).toBe(true);
    expect(allowed.has(ADMIN_ORIGIN)).toBe(true);
  });

  test("echoes an allowlisted origin with credentials", () => {
    const { headers } = resolveCors(allowed, createRequest("GET", { origin: ADMIN_ORIGIN }));

    expect(headers["access-control-allow-origin"]).toBe(ADMIN_ORIGIN);
    expect(headers["access-control-allow-credentials"]).toBe("true");
    expect(headers["vary"]).toBe("Origin");
  });

  test("never reflects a non-allowlisted origin and never uses a wildcard", () => {
    const { headers } = resolveCors(
      allowed,
      createRequest("GET", { origin: "https://evil.example" }),
    );

    expect(headers["access-control-allow-origin"]).toBe(undefined);
    expect(Object.values(headers).includes("*")).toBe(false);
  });

  test("flags OPTIONS as a preflight", () => {
    expect(
      resolveCors(allowed, createRequest("OPTIONS", { origin: PUBLIC_ORIGIN })).preflight,
    ).toBe(true);
    expect(resolveCors(allowed, createRequest("GET", { origin: PUBLIC_ORIGIN })).preflight).toBe(
      false,
    );
  });
});

describe("CORS wiring", () => {
  test("preflight OPTIONS short-circuits with 204 and credentialed allow headers", async () => {
    const app = createAppForCors();

    const response = await app.handle(createRequest("OPTIONS", { origin: PUBLIC_ORIGIN }));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(PUBLIC_ORIGIN);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("an allowlisted origin receives CORS headers on a normal request", async () => {
    const app = createAppForCors();

    const response = await app.handle(createRequest("GET", { origin: ADMIN_ORIGIN }));

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(ADMIN_ORIGIN);
  });

  test("a disallowed origin receives no allow-origin header", async () => {
    const app = createAppForCors();

    const response = await app.handle(createRequest("GET", { origin: "https://evil.example" }));

    expect(response.headers.get("access-control-allow-origin")).toBe(null);
  });
});
