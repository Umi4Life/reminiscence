import { describe, expect, test } from "bun:test";

import { createTestApp } from "../src/app";
import { testAppConfig } from "./test-config";

describe("GET /healthz", () => {
  test("returns ok without requiring database access", async () => {
    const app = createTestApp({
      config: testAppConfig,
      checkDatabase: async () => {
        throw new Error("database should not be queried");
      },
    });

    const response = await app.handle(new Request("http://localhost/healthz"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("GET /readyz", () => {
  test("returns 503 when database is unavailable", async () => {
    const app = createTestApp({
      config: testAppConfig,
      checkDatabase: async () => false,
    });

    const response = await app.handle(new Request("http://localhost/readyz"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
  });

  test("returns ok when database is reachable", async () => {
    const app = createTestApp({
      config: testAppConfig,
      checkDatabase: async () => true,
    });

    const response = await app.handle(new Request("http://localhost/readyz"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
