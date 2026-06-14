import { describe, expect, test } from "bun:test";

import type { PublicSessionService } from "../src/auth/public-sessions";
import { PUBLIC_BOARD_SESSION_COOKIE_NAME } from "../src/auth/public-sessions";
import { createTestApp } from "../src/app";
import { testAppConfig } from "./test-config";

const board = { id: "board-1", publicSlug: "demo-queue" };

function createFakePublicSessionService(
  overrides: Partial<PublicSessionService> = {},
): PublicSessionService & { claimCalls: string[]; logoutCalls: string[] } {
  const claimCalls: string[] = [];
  const logoutCalls: string[] = [];

  return {
    claimCalls,
    logoutCalls,

    async claimAccess(accessCode) {
      claimCalls.push(accessCode);

      if (accessCode === "valid-access-code") {
        return {
          status: "claimed",
          token: "public-session-token",
          expiresAt: new Date("2030-01-02T03:04:05.000Z"),
          board,
          mutationAccessExpiresAt: new Date("2030-01-02T03:04:05.000Z"),
        };
      }

      if (accessCode === "expired-access-code") {
        return {
          status: "expired",
          board,
          message: "This queue link is no longer active for editing.",
        };
      }

      if (accessCode === "revoked-access-code") {
        return {
          status: "revoked",
          board,
          message: "This queue link is no longer active for editing.",
        };
      }

      return {
        status: "invalid",
        message: "This queue link is not valid.",
      };
    },

    async resolveSession() {
      throw new Error("not implemented in route tests");
    },

    async logout(token) {
      logoutCalls.push(token);
    },

    ...overrides,
  };
}

function createApp(publicSessionService = createFakePublicSessionService()) {
  return createTestApp({
    config: testAppConfig,
    publicSessionService,
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

describe("public access routes", () => {
  test("valid access code creates a public session cookie", async () => {
    const publicSessionService = createFakePublicSessionService();
    const app = createApp(publicSessionService);

    const response = await app.handle(
      new Request("http://localhost/api/public/access/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessCode: "valid-access-code" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        claimed: true,
        board,
        mutationAccessExpiresAt: "2030-01-02T03:04:05.000Z",
      },
    });
    expect(publicSessionService.claimCalls).toEqual(["valid-access-code"]);

    const cookie = getSetCookie(response);
    expect(cookie.includes(`${PUBLIC_BOARD_SESSION_COOKIE_NAME}=public-session-token`)).toBe(true);
    expect(cookie.includes("HttpOnly")).toBe(true);
    expect(cookie.includes("SameSite=Lax")).toBe(true);
    expect(cookie.includes("Path=/")).toBe(true);
    expect(cookie.includes("Secure")).toBe(false);
  });

  test("expired credential returns view-only board info without session cookie", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/api/public/access/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessCode: "expired-access-code" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        claimed: false,
        reason: "expired",
        board,
        message: "This queue link is no longer active for editing.",
      },
    });
    expect(response.headers.get("set-cookie") === null).toBe(true);
  });

  test("revoked credential returns view-only board info without session cookie", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/api/public/access/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessCode: "revoked-access-code" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        claimed: false,
        reason: "revoked",
        board,
        message: "This queue link is no longer active for editing.",
      },
    });
    expect(response.headers.get("set-cookie") === null).toBe(true);
  });

  test("invalid unknown code returns safe generic invalid response", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/api/public/access/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessCode: "unknown-access-code" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        claimed: false,
        reason: "invalid",
        message: "This queue link is not valid.",
      },
    });
    expect(response.headers.get("set-cookie") === null).toBe(true);
  });

  test("malformed claim body returns 400", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/api/public/access/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessCode: "   " }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "validation_error", message: "Access code is required." },
    });
  });

  test("logout revokes session token and clears cookie", async () => {
    const publicSessionService = createFakePublicSessionService();
    const app = createApp(publicSessionService);

    const response = await app.handle(
      new Request("http://localhost/api/public/access/logout", {
        method: "POST",
        headers: { cookie: `${PUBLIC_BOARD_SESSION_COOKIE_NAME}=public-session-token` },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { loggedOut: true } });
    expect(publicSessionService.logoutCalls).toEqual(["public-session-token"]);

    const cookie = getSetCookie(response);
    expect(cookie.includes(`${PUBLIC_BOARD_SESSION_COOKIE_NAME}=`)).toBe(true);
    expect(cookie.includes("Max-Age=0")).toBe(true);
    expect(cookie.includes("HttpOnly")).toBe(true);
  });

  test("logout without session cookie still clears cookie", async () => {
    const publicSessionService = createFakePublicSessionService();
    const app = createApp(publicSessionService);

    const response = await app.handle(
      new Request("http://localhost/api/public/access/logout", { method: "POST" }),
    );

    expect(response.status).toBe(200);
    expect(publicSessionService.logoutCalls).toEqual([]);
    expect(getSetCookie(response).includes("Max-Age=0")).toBe(true);
  });
});
