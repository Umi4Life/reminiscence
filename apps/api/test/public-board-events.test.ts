import { describe, expect, test } from "bun:test";

import { createTestApp } from "../src/app";
import type { PublicBoardReadService } from "../src/queue/read";
import { testAppConfig } from "./test-config";

const timestamp = new Date("2026-06-01T00:00:00.000Z");

const eventsFixture = [
  {
    id: "event-1",
    type: "entry_added" as const,
    publicMessage: "Aki joined the queue.",
    displayNameSnapshot: "Aki",
    createdAt: timestamp,
  },
];

const serializedEventsFixture = eventsFixture.map((event) => ({
  ...event,
  createdAt: timestamp.toISOString(),
}));

function createFakePublicBoardReadService(
  overrides: Partial<PublicBoardReadService> = {},
): PublicBoardReadService {
  return {
    async getBoard() {
      throw new Error("not implemented in events route tests");
    },

    async getEvents(publicSlug, limit) {
      if (publicSlug !== "demo-queue") {
        return null;
      }

      return limit === undefined ? eventsFixture : eventsFixture.slice(0, limit);
    },

    ...overrides,
  };
}

function createApp(publicBoardReadService = createFakePublicBoardReadService()) {
  return createTestApp({
    config: testAppConfig,
    publicBoardReadService,
    checkDatabase: async () => true,
  });
}

describe("public board events route", () => {
  test("returns safe public events for a board", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/api/public/boards/demo-queue/events"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        events: serializedEventsFixture,
      },
    });
  });

  test("returns 404 for unknown public slug", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/api/public/boards/missing-queue/events"),
    );

    expect(response.status).toBe(404);
  });
});
