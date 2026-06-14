import type { Database } from "@queue-reminiscence/db";
import { rateLimitBuckets } from "@queue-reminiscence/db/schema";
import { lt, sql } from "drizzle-orm";

import { rateLimitedError } from "../http/errors";

export interface RateLimitConfig {
  scope: string;
  bucketKey: string;
  windowSeconds: number;
  maxCount: number;
}

export interface RateLimiter {
  checkAndIncrement(config: RateLimitConfig): Promise<void>;
  /**
   * Deletes expired buckets. Optional so lightweight test doubles need not
   * implement it. The DB-backed limiter always provides it.
   */
  deleteExpired?(): Promise<void>;
}

const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export function createDbRateLimiter(db: Database): RateLimiter {
  return {
    async checkAndIncrement({ scope, bucketKey, windowSeconds, maxCount }) {
      const now = new Date();
      const windowMs = windowSeconds * 1000;
      const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
      const expiresAt = new Date(windowStart.getTime() + windowMs * 2);

      const result = await db
        .insert(rateLimitBuckets)
        .values({
          scope,
          bucketKey,
          windowStart,
          count: 1,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [
            rateLimitBuckets.scope,
            rateLimitBuckets.bucketKey,
            rateLimitBuckets.windowStart,
          ],
          set: {
            count: sql`${rateLimitBuckets.count} + 1`,
          },
        })
        .returning({ count: rateLimitBuckets.count });

      const row = result[0];
      if (!row) {
        throw new Error("Rate limit upsert returned no rows.");
      }

      if (row.count > maxCount) {
        throw rateLimitedError();
      }
    },

    async deleteExpired() {
      const now = new Date();
      await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.expiresAt, now));
    },
  };
}

/**
 * Periodically deletes expired rate-limit buckets so the table does not grow
 * unbounded on an always-on deployment. Returns a function that stops the sweep.
 * Intended for the long-running server process, not tests.
 */
export function startRateLimitSweeper(
  rateLimiter: RateLimiter,
  intervalMs: number = DEFAULT_SWEEP_INTERVAL_MS,
): () => void {
  if (!rateLimiter.deleteExpired) {
    return () => {};
  }

  const timer = setInterval(() => {
    rateLimiter.deleteExpired?.().catch((error) => {
      console.error("Rate-limit bucket sweep failed", error);
    });
  }, intervalMs);

  if (typeof (timer as { unref?: () => void }).unref === "function") {
    (timer as { unref?: () => void }).unref?.();
  }

  return () => {
    clearInterval(timer);
  };
}
