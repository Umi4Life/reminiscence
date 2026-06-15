import { describe, expect, test } from "bun:test";

import { createTestApp } from "../src/app";
import { testAppConfig } from "./test-config";

function createApp() {
  return createTestApp({
    config: testAppConfig,
    checkDatabase: async () => true,
    rateLimiter: { async checkAndIncrement() {} },
  });
}

describe("security response headers", () => {
  test("defensive headers are set on responses", async () => {
    const app = createApp();

    const response = await app.handle(new Request("http://localhost/healthz"));

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("permissions-policy")).toBe(
      "geolocation=(), microphone=(), camera=()",
    );
  });

  test("HSTS is omitted when the API is not served over HTTPS", async () => {
    // testAppConfig uses http:// base URLs, so HSTS must not be emitted —
    // emitting it over plain HTTP would poison the browser's HSTS cache.
    const app = createApp();

    const response = await app.handle(new Request("http://localhost/healthz"));

    expect(response.headers.get("strict-transport-security")).toBe(null);
  });
});
