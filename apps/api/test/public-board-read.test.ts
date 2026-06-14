import { describe, expect, test } from "bun:test";

import type { PublicSessionService } from "../src/auth/public-sessions";
import { PUBLIC_BOARD_SESSION_COOKIE_NAME } from "../src/auth/public-sessions";
import { createTestApp } from "../src/app";
import type { PublicBoardRead, PublicBoardReadService } from "../src/public/board-read";
import { testAppConfig } from "./test-config";

const publicBoard: PublicBoardRead = {
  board: {
    publicSlug: "demo-queue",
    name: "Demo Queue",
    status: "open",
    venueName: "Echo MBK",
    organizationName: "Echo EX10",
  },
  queue: [
    { position: 1, displayName: "Aki" },
    { position: 2, displayName: "Mika" },
  ],
  queueLength: 2,
  displayVersion: 7,
  updatedAt: new Date("2030-01-01T12:00:00.000Z"),
  canMutate: false,
};

function createFakePublicBoardReadService(
  overrides: Partial<PublicBoardReadService> = {},
): PublicBoardReadService & { getCalls: Array<{ publicSlug: string; sessionToken?: string }> } {
  const getCalls: Array<{ publicSlug: string; sessionToken?: string }> = [];

  return {
    getCalls,

    async getBoardByPublicSlug(publicSlug, sessionToken) {
      getCalls.push({ publicSlug, sessionToken });

      if (publicSlug === "unknown-slug") {
        return { status: "not_found" };
      }

      if (publicSlug === "restricted-queue") {
        return { status: "forbidden" };
      }

      if (sessionToken === "valid-session-token") {
        return {
          status: "ok",
          board: {
            ...publicBoard,
            canMutate: true,
            mutationAccessExpiresAt: new Date("2030-01-02T03:04:05.000Z"),
          },
        };
      }

      return { status: "ok", board: publicBoard };
    },

    async listRecentEvents() {
      throw new Error("not implemented in board read route tests");
    },

    ...overrides,
  };
}

function createFakePublicSessionService(): PublicSessionService {
  return {
    async claimAccess() {
      throw new Error("not implemented in board read route tests");
    },

    async resolveSession() {
      throw new Error("not implemented in board read route tests");
    },

    async logout() {
      throw new Error("not implemented in board read route tests");
    },
  };
}

function createApp(publicBoardReadService = createFakePublicBoardReadService()) {
  return createTestApp({
    config: testAppConfig,
    publicSessionService: createFakePublicSessionService(),
    publicBoardReadService,
    checkDatabase: async () => true,
  });
}

describe("public board read routes", () => {
  test("unknown slug returns 404", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/api/public/boards/unknown-slug"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "not_found", message: "Resource not found." },
    });
  });

  test("restricted board returns 403", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/api/public/boards/restricted-queue"),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "forbidden",
        message: "You do not have permission to perform this action.",
      },
    });
  });

  test("returns active entries with derived positions", async () => {
    const app = createApp();

    const response = await app.handle(new Request("http://localhost/api/public/boards/demo-queue"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        board: publicBoard.board,
        queue: publicBoard.queue,
        queueLength: 2,
        displayVersion: 7,
        updatedAt: "2030-01-01T12:00:00.000Z",
        canMutate: false,
      },
    });
  });

  test("session cookie is forwarded for mutation access flags", async () => {
    const publicBoardReadService = createFakePublicBoardReadService();
    const app = createApp(publicBoardReadService);

    const response = await app.handle(
      new Request("http://localhost/api/public/boards/demo-queue", {
        headers: { cookie: `${PUBLIC_BOARD_SESSION_COOKIE_NAME}=valid-session-token` },
      }),
    );

    expect(response.status).toBe(200);
    expect(publicBoardReadService.getCalls).toEqual([
      { publicSlug: "demo-queue", sessionToken: "valid-session-token" },
    ]);

    const json = (await response.json()) as {
      ok: boolean;
      data: { canMutate: boolean; mutationAccessExpiresAt?: string };
    };

    expect(json.data.canMutate).toBe(true);
    expect(json.data.mutationAccessExpiresAt).toBe("2030-01-02T03:04:05.000Z");
  });

  test("request without session cookie omits session token", async () => {
    const publicBoardReadService = createFakePublicBoardReadService();
    const app = createApp(publicBoardReadService);

    await app.handle(new Request("http://localhost/api/public/boards/demo-queue"));

    expect(publicBoardReadService.getCalls).toEqual([{ publicSlug: "demo-queue" }]);
    expect(publicBoardReadService.getCalls[0]?.sessionToken === undefined).toBe(true);
  });
});
