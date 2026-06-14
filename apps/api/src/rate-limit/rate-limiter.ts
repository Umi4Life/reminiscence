import type { Database } from "@queue-reminiscence/db";
import { rateLimitBuckets } from "@queue-reminiscence/db/schema";
import { sql } from "drizzle-orm";

import { rateLimitedError } from "../http/errors";

export interface RateLimitConfig {
  scope: string;
  bucketKey: string;
  windowSeconds: number;
  maxCount: number;
}

export interface RateLimiter {
  checkAndIncrement(config: RateLimitConfig): Promise<void>;
}

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
  };
}
