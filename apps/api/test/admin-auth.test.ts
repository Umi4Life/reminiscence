import { describe, expect, test } from "bun:test";

import type { AdminAuthService, LoginResult } from "../src/auth/admin-sessions";
import { ADMIN_SESSION_COOKIE_NAME } from "../src/auth/admin-sessions";
import { rateLimitedError, unauthorizedError } from "../src/http/errors";
import type { RateLimiter } from "../src/rate-limit/rate-limiter";
import { createTestApp } from "../src/app";
import { testAppConfig } from "./test-config";

const activeContext = {
  admin: {
    id: "admin-1",
    email: "demo@local.test",
    displayName: "Demo Admin",
  },
  memberships: [
    {
      id: "membership-1",
      organizationId: "org-1",
      venueId: null,
      role: "org_owner" as const,
    },
  ],
};

function createFakeAuthService(): AdminAuthService & { loggedOutTokens: string[] } {
  const loggedOutTokens: string[] = [];

  return {
    loggedOutTokens,

    async login(email: string, password: string): Promise<LoginResult> {
      if (email === "disabled@local.test") {
        throw unauthorizedError("Invalid email or password.");
      }

      if (email !== "demo@local.test" || password !== "correct-password") {
        throw unauthorizedError("Invalid email or password.");
      }

      return {
        ...activeContext,
        token: "test-session-token",
        expiresAt: new Date("2030-01-02T03:04:05.000Z"),
      };
    },

    async resolve(token: string) {
      if (token !== "test-session-token") {
        throw unauthorizedError();
      }

      return activeContext;
    },

    async logout(token: string): Promise<void> {
      loggedOutTokens.push(token);
    },
  };
}

function createPermissiveRateLimiter(): RateLimiter {
  return {
    async checkAndIncrement() {},
  };
}

/** A limiter that rejects as soon as the given scope is checked. */
function createBlockingRateLimiter(blockedScope: string): RateLimiter {
  return {
    async checkAndIncrement({ scope }) {
      if (scope === blockedScope) {
        throw rateLimitedError();
      }
    },
  };
}

function createAppWithFakeAuth(
  authService = createFakeAuthService(),
  rateLimiter: RateLimiter = createPermissiveRateLimiter(),
) {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: authService,
    rateLimiter,
    checkDatabase: async () => true,
  });
}

function getSetCookie(response: Response): string {
  const cookie = response.headers.get("set-cookie");

  if (!cookie) {
    throw new Error("expected Set-Cookie header");
  }

  return cookie;
}

describe("admin auth routes", () => {
  test("valid login creates a session cookie and returns admin identity", async () => {
    const app = createAppWithFakeAuth();

    const response = await app.handle(
      new Request("http://localhost/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "demo@local.test", password: "correct-password" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: activeContext });

    const cookie = getSetCookie(response);
    expect(cookie.includes(`${ADMIN_SESSION_COOKIE_NAME}=test-session-token`)).toBe(true);
    expect(cookie.includes("HttpOnly")).toBe(true);
    expect(cookie.includes("SameSite=Lax")).toBe(true);
    expect(cookie.includes("Path=/")).toBe(true);
    expect(cookie.includes("Secure")).toBe(false);
  });

  test("invalid login returns 401", async () => {
    const app = createAppWithFakeAuth();

    const response = await app.handle(
      new Request("http://localhost/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "demo@local.test", password: "wrong-password" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "Invalid email or password." },
    });
  });

  test("login is rejected with 429 when the per-IP limit is exceeded", async () => {
    const app = createAppWithFakeAuth(
      createFakeAuthService(),
      createBlockingRateLimiter("admin_login_ip"),
    );

    const response = await app.handle(
      new Request("http://localhost/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "demo@local.test", password: "correct-password" }),
      }),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "rate_limited", message: "Too many requests. Try again shortly." },
    });
  });

  test("login is rejected with 429 when the per-email limit is exceeded", async () => {
    const app = createAppWithFakeAuth(
      createFakeAuthService(),
      createBlockingRateLimiter("admin_login_email"),
    );

    const response = await app.handle(
      new Request("http://localhost/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "demo@local.test", password: "correct-password" }),
      }),
    );

    expect(response.status).toBe(429);
  });

  test("disabled admin users cannot authenticate", async () => {
    const app = createAppWithFakeAuth();

    const response = await app.handle(
      new Request("http://localhost/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "disabled@local.test", password: "correct-password" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "Invalid email or password." },
    });
  });

  test("malformed login body returns 400", async () => {
    const app = createAppWithFakeAuth();

    const response = await app.handle(
      new Request("http://localhost/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "demo@local.test" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "validation_error", message: "Email and password are required." },
    });
  });

  test("me returns current admin identity and memberships for a valid session cookie", async () => {
    const app = createAppWithFakeAuth();

    const response = await app.handle(
      new Request("http://localhost/api/admin/me", {
        headers: { cookie: `${ADMIN_SESSION_COOKIE_NAME}=test-session-token` },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: activeContext });
  });

  test("me returns 401 without a session cookie", async () => {
    const app = createAppWithFakeAuth();

    const response = await app.handle(new Request("http://localhost/api/admin/me"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "Authentication required." },
    });
  });

  test("logout revokes session token and clears cookie", async () => {
    const authService = createFakeAuthService();
    const app = createAppWithFakeAuth(authService);

    const response = await app.handle(
      new Request("http://localhost/api/admin/auth/logout", {
        method: "POST",
        headers: { cookie: `${ADMIN_SESSION_COOKIE_NAME}=test-session-token` },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { loggedOut: true } });
    expect(authService.loggedOutTokens).toEqual(["test-session-token"]);

    const cookie = getSetCookie(response);
    expect(cookie.includes(`${ADMIN_SESSION_COOKIE_NAME}=`)).toBe(true);
    expect(cookie.includes("Max-Age=0")).toBe(true);
    expect(cookie.includes("HttpOnly")).toBe(true);
  });
});
