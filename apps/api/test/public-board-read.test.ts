import { describe, expect, test } from "bun:test";

import { createTestApp } from "../src/app";
import type { PublicBoardReadService } from "../src/queue/read";
import { testAppConfig } from "./test-config";

const timestamp = new Date("2026-06-01T00:00:00.000Z");
const mutationExpiresAt = new Date("2030-01-02T03:04:05.000Z");

const boardFixture = {
  organization: {
    id: "org-1",
    slug: "org-a",
    name: "Organization A",
  },
  venue: {
    id: "venue-1",
    slug: "venue-a1",
    name: "Venue A1",
  },
  board: {
    publicSlug: "demo-queue",
    name: "Demo Queue",
    description: null,
    status: "open" as const,
    publicAddPolicy: "access_code_required" as const,
    publicRemovePolicy: "access_code_required" as const,
    displayVersion: 3,
    updatedAt: timestamp,
  },
  queue: [
    {
      id: "entry-1",
      displayName: "Aki",
      position: 1,
      sortOrder: 1,
      createdAt: timestamp,
    },
  ],
  mutationAccess: {
    available: true,
    expiresAt: mutationExpiresAt,
    canAdd: true,
    canRemove: true,
  },
};

const serializedBoardFixture = {
  ...boardFixture,
  board: {
    ...boardFixture.board,
    updatedAt: timestamp.toISOString(),
  },
  queue: boardFixture.queue.map((entry) => ({
    ...entry,
    createdAt: timestamp.toISOString(),
  })),
  mutationAccess: {
    ...boardFixture.mutationAccess,
    expiresAt: mutationExpiresAt.toISOString(),
  },
};

function createFakePublicBoardReadService(
  overrides: Partial<PublicBoardReadService> = {},
): PublicBoardReadService {
  return {
    async getBoard(publicSlug) {
      if (publicSlug !== "demo-queue") {
        return null;
      }

      return boardFixture;
    },

    async getEvents() {
      throw new Error("not implemented in read route tests");
    },

    ...overrides,
  };
}

function createApp(publicBoardReadService = createFakePublicBoardReadService()) {
  return createTestApp({
    config: testAppConfig,
    publicBoardReadService,
    checkDatabase: async () => true,
    rateLimiter: { async checkAndIncrement() {} },
  });
}

describe("public board read route", () => {
  test("returns board payload with derived queue positions", async () => {
    const app = createApp();

    const response = await app.handle(new Request("http://localhost/api/public/boards/demo-queue"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        board: serializedBoardFixture,
      },
    });
  });

  test("returns 404 for unknown public slug", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/api/public/boards/missing-queue"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "not_found",
        message: "Resource not found.",
      },
    });
  });
});
