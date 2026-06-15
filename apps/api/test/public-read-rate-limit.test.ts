import { describe, expect, test } from "bun:test";

import { createTestApp } from "../src/app";
import { rateLimitedError } from "../src/http/errors";
import type { PublicBoardReadService } from "../src/queue/read";
import type { RateLimiter } from "../src/rate-limit/rate-limiter";
import { testAppConfig } from "./test-config";

function createFakeReadService(): PublicBoardReadService {
  return {
    async getBoard() {
      throw new Error("read service should not be reached when rate-limited");
    },
    async getEvents() {
      throw new Error("read service should not be reached when rate-limited");
    },
  };
}

function createApp(rateLimiter: RateLimiter) {
  return createTestApp({
    config: testAppConfig,
    publicBoardReadService: createFakeReadService(),
    checkDatabase: async () => true,
    rateLimiter,
  });
}

describe("public board read rate limiting", () => {
  test("exceeding the IP limit returns 429 before the read service runs", async () => {
    const blocking: RateLimiter = {
      async checkAndIncrement() {
        throw rateLimitedError();
      },
    };
    const app = createApp(blocking);

    const response = await app.handle(new Request("http://localhost/api/public/boards/demo-queue"));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "rate_limited", message: "Too many requests. Try again shortly." },
    });
  });
});
