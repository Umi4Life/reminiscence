import { describe, expect, test } from "bun:test";

import type { PublicSessionService } from "../src/auth/public-sessions";
import { createTestApp } from "../src/app";
import type { PublicBoardEventSummary, PublicBoardReadService } from "../src/public/board-read";
import { testAppConfig } from "./test-config";

const publicEvents: PublicBoardEventSummary[] = [
  {
    type: "entry_added",
    publicMessage: "Aki joined the queue.",
    createdAt: new Date("2030-01-03T10:00:00.000Z"),
    displayNameSnapshot: "Aki",
  },
  {
    type: "entry_removed",
    publicMessage: "Mika left the queue.",
    createdAt: new Date("2030-01-03T09:00:00.000Z"),
  },
];

function createFakePublicBoardReadService(
  overrides: Partial<PublicBoardReadService> = {},
): PublicBoardReadService & {
  listCalls: Array<{ publicSlug: string; limit?: number }>;
} {
  const listCalls: Array<{ publicSlug: string; limit?: number }> = [];

  return {
    listCalls,

    async getBoardByPublicSlug() {
      throw new Error("not implemented in board events route tests");
    },

    async listRecentEvents(publicSlug, limit = 20) {
      listCalls.push({ publicSlug, limit });

      if (publicSlug === "unknown-slug") {
        return { status: "not_found" };
      }

      if (publicSlug === "restricted-queue") {
        return { status: "forbidden" };
      }

      const events = publicEvents.slice(0, limit);

      return { status: "ok", events };
    },

    ...overrides,
  };
}

function createFakePublicSessionService(): PublicSessionService {
  return {
    async claimAccess() {
      throw new Error("not implemented in board events route tests");
    },

    async resolveSession() {
      throw new Error("not implemented in board events route tests");
    },

    async logout() {
      throw new Error("not implemented in board events route tests");
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

describe("public board events routes", () => {
  test("unknown slug returns 404", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/api/public/boards/unknown-slug/events"),
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
      new Request("http://localhost/api/public/boards/restricted-queue/events"),
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

  test("returns only safe public event fields", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/api/public/boards/demo-queue/events"),
    );

    expect(response.status).toBe(200);

    const json = (await response.json()) as {
      ok: boolean;
      data: { events: Array<Record<string, unknown>> };
    };

    expect(json.ok).toBe(true);
    expect(json.data.events).toEqual([
      {
        type: "entry_added",
        publicMessage: "Aki joined the queue.",
        createdAt: "2030-01-03T10:00:00.000Z",
        displayNameSnapshot: "Aki",
      },
      {
        type: "entry_removed",
        publicMessage: "Mika left the queue.",
        createdAt: "2030-01-03T09:00:00.000Z",
      },
    ]);

    for (const event of json.data.events) {
      expect(event.ipHash === undefined).toBe(true);
      expect(event.userAgentHash === undefined).toBe(true);
      expect(event.publicSessionId === undefined).toBe(true);
      expect(event.actorAdminUserId === undefined).toBe(true);
      expect(event.id === undefined).toBe(true);
      expect(event.boardId === undefined).toBe(true);
      expect(event.entryId === undefined).toBe(true);
    }
  });

  test("respects limit query parameter", async () => {
    const publicBoardReadService = createFakePublicBoardReadService();
    const app = createApp(publicBoardReadService);

    const response = await app.handle(
      new Request("http://localhost/api/public/boards/demo-queue/events?limit=1"),
    );

    expect(response.status).toBe(200);
    expect(publicBoardReadService.listCalls).toEqual([{ publicSlug: "demo-queue", limit: 1 }]);

    const json = (await response.json()) as {
      ok: boolean;
      data: { events: unknown[] };
    };

    expect(json.data.events.length).toBe(1);
  });

  test("defaults limit to 20", async () => {
    const publicBoardReadService = createFakePublicBoardReadService();
    const app = createApp(publicBoardReadService);

    await app.handle(new Request("http://localhost/api/public/boards/demo-queue/events"));

    expect(publicBoardReadService.listCalls).toEqual([{ publicSlug: "demo-queue", limit: 20 }]);
  });

  test("invalid limit returns 400", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/api/public/boards/demo-queue/events?limit=0"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "validation_error", message: "limit must be an integer between 1 and 100." },
    });
  });
});
