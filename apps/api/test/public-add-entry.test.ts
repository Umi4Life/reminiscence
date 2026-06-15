import { describe, expect, test } from "bun:test";

import { createTestApp } from "../src/app";
import { PUBLIC_BOARD_SESSION_COOKIE_NAME } from "../src/auth/public-sessions";
import { forbiddenError, validationError } from "../src/http/errors";
import type { PublicBoardReadService } from "../src/queue/read";
import type { QueueMutationService } from "../src/queue/mutations";
import { testAppConfig } from "./test-config";

const timestamp = new Date("2026-06-01T00:00:00.000Z");
const mutationExpiresAt = new Date("2030-01-02T03:04:05.000Z");
const publicSlug = "demo-queue";
const sessionCookie = `${PUBLIC_BOARD_SESSION_COOKIE_NAME}=public-session-token`;

const entryFixture = {
  id: "entry-1",
  displayName: "Aki",
  position: 1,
  sortOrder: 1,
  status: "active" as const,
  createdAt: timestamp,
};

const serializedEntryFixture = {
  ...entryFixture,
  createdAt: timestamp.toISOString(),
};

function createFakeQueueMutationService(
  overrides: Partial<QueueMutationService> = {},
): QueueMutationService & { addCalls: Array<{ publicSlug: string; displayName: string }> } {
  const addCalls: Array<{ publicSlug: string; displayName: string }> = [];

  return {
    addCalls,

    async addEntry(publicSlugArg, _sessionToken, displayName) {
      addCalls.push({ publicSlug: publicSlugArg, displayName });

      if (publicSlugArg === "closed-queue") {
        throw forbiddenError("This board is closed.");
      }

      if (publicSlugArg === "policy-blocked-queue") {
        throw forbiddenError("Public queue adds are not allowed on this board.");
      }

      if (displayName.trim().length === 0) {
        throw validationError("Display name is required.");
      }

      return entryFixture;
    },

    async removeEntry() {
      throw new Error("not implemented in add route tests");
    },

    ...overrides,
  };
}

function createFakePublicBoardReadService(
  overrides: Partial<PublicBoardReadService> = {},
): PublicBoardReadService {
  return {
    async getBoard(slug) {
      if (slug !== publicSlug) {
        return null;
      }

      return {
        organization: { id: "org-1", slug: "org-a", name: "Organization A" },
        venue: { id: "venue-1", slug: "venue-a1", name: "Venue A1" },
        board: {
          publicSlug,
          name: "Demo Queue",
          description: null,
          status: "open",
          publicAddPolicy: "access_code_required",
          publicRemovePolicy: "access_code_required",
          displayVersion: 2,
          updatedAt: timestamp,
        },
        queue: [entryFixture],
        mutationAccess: {
          available: true,
          expiresAt: mutationExpiresAt,
          canAdd: true,
          canRemove: true,
        },
      };
    },

    async getEvents() {
      return [];
    },

    ...overrides,
  };
}

function createApp(
  queueMutationService = createFakeQueueMutationService(),
  publicBoardReadService = createFakePublicBoardReadService(),
) {
  return createTestApp({
    config: testAppConfig,
    queueMutationService,
    publicBoardReadService,
    checkDatabase: async () => true,
    rateLimiter: { async checkAndIncrement() {} },
  });
}

describe("public add entry route", () => {
  test("returns 401 without a public session cookie", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request(`http://localhost/api/public/boards/${publicSlug}/entries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Aki" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  test("returns 403 when the board is closed", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/api/public/boards/closed-queue/entries", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie,
        },
        body: JSON.stringify({ displayName: "Aki" }),
      }),
    );

    expect(response.status).toBe(403);
  });

  test("returns 403 when public add policy blocks the mutation", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/api/public/boards/policy-blocked-queue/entries", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie,
        },
        body: JSON.stringify({ displayName: "Aki" }),
      }),
    );

    expect(response.status).toBe(403);
  });

  test("returns 400 for an invalid display name", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request(`http://localhost/api/public/boards/${publicSlug}/entries`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie,
        },
        body: JSON.stringify({ displayName: "   " }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test("returns created entry with derived position", async () => {
    const queueMutationService = createFakeQueueMutationService();
    const app = createApp(queueMutationService);

    const response = await app.handle(
      new Request(`http://localhost/api/public/boards/${publicSlug}/entries`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie,
        },
        body: JSON.stringify({ displayName: "Aki" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        entry: serializedEntryFixture,
      },
    });
    expect(queueMutationService.addCalls).toEqual([{ publicSlug, displayName: "Aki" }]);
  });

  test("removed entries are excluded from active queue reads", async () => {
    const publicBoardReadService = createFakePublicBoardReadService({
      async getBoard() {
        return {
          organization: { id: "org-1", slug: "org-a", name: "Organization A" },
          venue: { id: "venue-1", slug: "venue-a1", name: "Venue A1" },
          board: {
            publicSlug,
            name: "Demo Queue",
            description: null,
            status: "open",
            publicAddPolicy: "access_code_required",
            publicRemovePolicy: "access_code_required",
            displayVersion: 3,
            updatedAt: timestamp,
          },
          queue: [],
          mutationAccess: {
            available: true,
            expiresAt: mutationExpiresAt,
            canAdd: true,
            canRemove: true,
          },
        };
      },
    });
    const app = createApp(createFakeQueueMutationService(), publicBoardReadService);

    const response = await app.handle(
      new Request(`http://localhost/api/public/boards/${publicSlug}`),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { board: { queue: unknown[] } };
    };
    expect(json.data.board.queue.length).toBe(0);
    expect(json.data.board.queue[0] === undefined).toBe(true);
  });
});
