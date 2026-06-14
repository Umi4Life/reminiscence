import { describe, expect, test } from "bun:test";

import type { AdminAuthService } from "../src/auth/admin-sessions";
import { createTestApp } from "../src/app";
import {
  adminOriginOf,
  isAdminMutationRequest,
  isForbiddenAdminCrossOrigin,
} from "../src/http/csrf";
import { unauthorizedError } from "../src/http/errors";
import type { RateLimiter } from "../src/rate-limit/rate-limiter";
import { testAppConfig } from "./test-config";

const ADMIN_ORIGIN = adminOriginOf(testAppConfig); // http://localhost:3001
const FOREIGN_ORIGIN = "https://evil.example";

function req(method: string, path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { method, headers });
}

describe("CSRF helpers", () => {
  test("only admin mutating methods are flagged", () => {
    expect(isAdminMutationRequest(req("POST", "/api/admin/auth/login"))).toBe(true);
    expect(isAdminMutationRequest(req("PATCH", "/api/admin/boards/b1"))).toBe(true);
    expect(isAdminMutationRequest(req("GET", "/api/admin/me"))).toBe(false);
    expect(isAdminMutationRequest(req("POST", "/api/public/access/claim"))).toBe(false);
  });

  test("foreign origin on an admin mutation is forbidden", () => {
    expect(
      isForbiddenAdminCrossOrigin(
        req("POST", "/api/admin/auth/login", { origin: FOREIGN_ORIGIN }),
        ADMIN_ORIGIN,
      ),
    ).toBe(true);
  });

  test("admin origin and origin-less admin mutations are allowed", () => {
    expect(
      isForbiddenAdminCrossOrigin(
        req("POST", "/api/admin/auth/login", { origin: ADMIN_ORIGIN }),
        ADMIN_ORIGIN,
      ),
    ).toBe(false);
    expect(isForbiddenAdminCrossOrigin(req("POST", "/api/admin/auth/login"), ADMIN_ORIGIN)).toBe(
      false,
    );
  });

  test("safe-method admin requests are never CSRF-blocked even from a foreign origin", () => {
    expect(
      isForbiddenAdminCrossOrigin(
        req("GET", "/api/admin/me", { origin: FOREIGN_ORIGIN }),
        ADMIN_ORIGIN,
      ),
    ).toBe(false);
  });
});

describe("CSRF wiring", () => {
  function createAuthService(): AdminAuthService & { loginCalls: number } {
    const service = {
      loginCalls: 0,
      async login() {
        service.loginCalls += 1;
        throw unauthorizedError("Invalid email or password.");
      },
      async resolve() {
        throw unauthorizedError();
      },
      async logout() {},
    };
    return service;
  }

  function createApp(authService: AdminAuthService) {
    const permissive: RateLimiter = { async checkAndIncrement() {} };
    return createTestApp({
      config: testAppConfig,
      adminAuthService: authService,
      rateLimiter: permissive,
      checkDatabase: async () => true,
    });
  }

  test("admin mutation from a foreign origin is rejected with 403 before auth runs", async () => {
    const authService = createAuthService();
    const app = createApp(authService);

    const response = await app.handle(
      new Request("http://localhost/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: FOREIGN_ORIGIN },
        body: JSON.stringify({ email: "demo@local.test", password: "correct-password" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "forbidden", message: "Cross-origin request rejected." },
    });
    expect(authService.loginCalls).toBe(0);
  });

  test("admin mutation from the admin origin passes the CSRF gate", async () => {
    const authService = createAuthService();
    const app = createApp(authService);

    const response = await app.handle(
      new Request("http://localhost/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: ADMIN_ORIGIN },
        body: JSON.stringify({ email: "demo@local.test", password: "correct-password" }),
      }),
    );

    // Not blocked by CSRF; reaches auth (which rejects these credentials).
    expect(response.status).toBe(401);
    expect(authService.loginCalls).toBe(1);
  });
});
