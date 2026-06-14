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
const entryId = "entry-1";
const sessionCookie = `${PUBLIC_BOARD_SESSION_COOKIE_NAME}=public-session-token`;

function createFakeQueueMutationService(
  overrides: Partial<QueueMutationService> = {},
): QueueMutationService & { removeCalls: string[] } {
  const removeCalls: string[] = [];

  return {
    removeCalls,

    async addEntry() {
      throw new Error("not implemented in remove route tests");
    },

    async removeEntry(publicSlugArg, _sessionToken, entryIdArg) {
      removeCalls.push(entryIdArg);

      if (publicSlugArg === "closed-queue") {
        throw forbiddenError("This board is closed.");
      }

      if (publicSlugArg === "policy-blocked-queue") {
        throw forbiddenError("Public queue removals are not allowed on this board.");
      }

      if (entryIdArg === "already-removed") {
        throw validationError("This entry is no longer in the queue.");
      }

      return { entryId: entryIdArg, removed: true as const };
    },

    ...overrides,
  };
}

function createFakePublicBoardReadService(): PublicBoardReadService {
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
          displayVersion: 4,
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

    async getEvents() {
      return [];
    },
  };
}

function createApp(queueMutationService = createFakeQueueMutationService()) {
  return createTestApp({
    config: testAppConfig,
    queueMutationService,
    publicBoardReadService: createFakePublicBoardReadService(),
    checkDatabase: async () => true,
  });
}

describe("public remove entry route", () => {
  test("returns 401 without a public session cookie", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request(`http://localhost/api/public/boards/${publicSlug}/entries/${entryId}/remove`, {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
  });

  test("returns 403 when the board is closed", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/api/public/boards/closed-queue/entries/entry-1/remove", {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(403);
  });

  test("returns 403 when public remove policy blocks the mutation", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request(
        "http://localhost/api/public/boards/policy-blocked-queue/entries/entry-1/remove",
        {
          method: "POST",
          headers: { cookie: sessionCookie },
        },
      ),
    );

    expect(response.status).toBe(403);
  });

  test("returns 400 when the entry was already removed", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request(
        `http://localhost/api/public/boards/${publicSlug}/entries/already-removed/remove`,
        {
          method: "POST",
          headers: { cookie: sessionCookie },
        },
      ),
    );

    expect(response.status).toBe(400);
  });

  test("returns 200 for a successful remove", async () => {
    const queueMutationService = createFakeQueueMutationService();
    const app = createApp(queueMutationService);

    const response = await app.handle(
      new Request(`http://localhost/api/public/boards/${publicSlug}/entries/${entryId}/remove`, {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        entryId,
        removed: true,
      },
    });
    expect(queueMutationService.removeCalls).toEqual([entryId]);
  });

  test("removed entry is excluded from active queue reads", async () => {
    const app = createApp();

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
