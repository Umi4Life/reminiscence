import { describe, expect, test } from "bun:test";

import type { Database } from "@queue-reminiscence/db";

import { createDbPublicBoardReadService, maxEventLimit } from "../src/queue/read";
import type { PublicSessionService } from "../src/auth/public-sessions";
import { testAppConfig } from "./test-config";

/**
 * Captures every `.limit(n)` argument so we can assert the event query is
 * clamped to `maxEventLimit` regardless of the caller-supplied value.
 */
function createLimitCapturingDb(capturedLimits: number[]): Database {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: (n: number) => {
      capturedLimits.push(n);
      // First call resolves the board lookup (returns one row); subsequent
      // calls resolve the events query (rows don't matter for this assertion).
      return Promise.resolve(capturedLimits.length === 1 ? [{ id: "board-1" }] : []);
    },
  };

  return {
    select: () => chain,
  } as unknown as Database;
}

const noopSessionService = {} as unknown as PublicSessionService;

describe("getEvents limit clamp", () => {
  test("caps an oversized caller limit at maxEventLimit", async () => {
    const capturedLimits: number[] = [];
    const service = createDbPublicBoardReadService(
      createLimitCapturingDb(capturedLimits),
      testAppConfig,
      noopSessionService,
    );

    await service.getEvents("demo-queue", 100_000);

    // capturedLimits[0] is the board lookup (.limit(1)); [1] is the events query.
    expect(capturedLimits[1]).toBe(maxEventLimit);
  });

  test("passes through a small caller limit unchanged", async () => {
    const capturedLimits: number[] = [];
    const service = createDbPublicBoardReadService(
      createLimitCapturingDb(capturedLimits),
      testAppConfig,
      noopSessionService,
    );

    await service.getEvents("demo-queue", 5);

    expect(capturedLimits[1]).toBe(5);
  });
});
