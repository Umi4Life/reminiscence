import { describe, expect, test } from "bun:test";

import { rateLimitedError } from "../src/http/errors";
import { createDbRateLimiter } from "../src/rate-limit/rate-limiter";
import { getTestDb } from "./test-config";

const testDb = getTestDb();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function expectRateLimited(promise: Promise<void>): Promise<void> {
  let thrown: unknown;

  try {
    await promise;
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toEqual(rateLimitedError());
}

describe("createDbRateLimiter", () => {
  if (!testDb) {
    test("skip — no DATABASE_URL", () => {});
    return;
  }

  const rateLimiter = createDbRateLimiter(testDb);

  test("allows first N requests within window", async () => {
    const bucketKey = crypto.randomUUID();
    const maxCount = 3;

    for (let attempt = 1; attempt <= maxCount; attempt += 1) {
      await rateLimiter.checkAndIncrement({
        scope: "test_allow",
        bucketKey,
        windowSeconds: 60,
        maxCount,
      });
    }
  });

  test("throws rateLimitedError on the (maxCount+1)th call within same window", async () => {
    const bucketKey = crypto.randomUUID();
    const maxCount = 3;

    for (let attempt = 1; attempt <= maxCount; attempt += 1) {
      await rateLimiter.checkAndIncrement({
        scope: "test_limit",
        bucketKey,
        windowSeconds: 60,
        maxCount,
      });
    }

    await expectRateLimited(
      rateLimiter.checkAndIncrement({
        scope: "test_limit",
        bucketKey,
        windowSeconds: 60,
        maxCount,
      }),
    );
  });

  test("different scopes are independent", async () => {
    const bucketKey = crypto.randomUUID();
    const maxCount = 2;

    for (let attempt = 1; attempt <= maxCount; attempt += 1) {
      await rateLimiter.checkAndIncrement({
        scope: "add_1m",
        bucketKey,
        windowSeconds: 60,
        maxCount,
      });
    }

    await rateLimiter.checkAndIncrement({
      scope: "remove_1m",
      bucketKey,
      windowSeconds: 60,
      maxCount,
    });
  });

  test("different bucketKeys are independent", async () => {
    const bucketKeyA = crypto.randomUUID();
    const bucketKeyB = crypto.randomUUID();
    const maxCount = 2;

    for (let attempt = 1; attempt <= maxCount; attempt += 1) {
      await rateLimiter.checkAndIncrement({
        scope: "test_bucket",
        bucketKey: bucketKeyA,
        windowSeconds: 60,
        maxCount,
      });
    }

    await rateLimiter.checkAndIncrement({
      scope: "test_bucket",
      bucketKey: bucketKeyB,
      windowSeconds: 60,
      maxCount,
    });
  });

  test("new window resets count", async () => {
    const bucketKey = crypto.randomUUID();
    const maxCount = 1;

    await rateLimiter.checkAndIncrement({
      scope: "test_window",
      bucketKey,
      windowSeconds: 1,
      maxCount,
    });

    await expectRateLimited(
      rateLimiter.checkAndIncrement({
        scope: "test_window",
        bucketKey,
        windowSeconds: 1,
        maxCount,
      }),
    );

    await sleep(1100);

    await rateLimiter.checkAndIncrement({
      scope: "test_window",
      bucketKey,
      windowSeconds: 1,
      maxCount,
    });
  });
});
