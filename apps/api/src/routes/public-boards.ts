import type { AppConfig } from "@queue-reminiscence/config";
import { Elysia, t } from "elysia";

import { readPublicBoardSessionToken } from "./public-access";
import { notFoundError, unauthorizedError } from "../http/errors";
import { apiSuccess } from "../http/response";
import { buildMutationRequestMeta, hashClientIp } from "../public/audit-metadata";
import type { QueueMutationService } from "../queue/mutations";
import type { PublicBoardReadService } from "../queue/read";
import type { RateLimiter } from "../rate-limit/rate-limiter";

export interface PublicBoardsRouteDeps {
  config: AppConfig;
  publicBoardReadService: PublicBoardReadService;
  queueMutationService: QueueMutationService;
  rateLimiter: RateLimiter;
}

// Throttle unauthenticated public reads per source IP. These guard against
// slug enumeration and high-frequency polling; limits are generous enough for
// legitimate display refreshes. Tune in a later phase if real polling needs it.
const BOARD_READ_IP_LIMIT = { scope: "board_read_ip_1m", windowSeconds: 60, maxCount: 60 } as const;
const EVENTS_IP_LIMIT = { scope: "events_ip_1m", windowSeconds: 60, maxCount: 30 } as const;

function requireSessionToken(headers: Headers): string {
  const token = readPublicBoardSessionToken(headers);

  if (!token) {
    throw unauthorizedError();
  }

  return token;
}

export function publicBoardsRoutes(deps: PublicBoardsRouteDeps) {
  return new Elysia({ name: "public-boards-routes" })
    .get("/api/public/boards/:publicSlug", async ({ params, request }) => {
      const ipKey = hashClientIp(request, deps.config) ?? "unknown";
      await deps.rateLimiter.checkAndIncrement({ ...BOARD_READ_IP_LIMIT, bucketKey: ipKey });

      const sessionToken = readPublicBoardSessionToken(request.headers);
      const board = await deps.publicBoardReadService.getBoard(params.publicSlug, sessionToken);

      if (!board) {
        throw notFoundError();
      }

      return apiSuccess({ board });
    })
    .get(
      "/api/public/boards/:publicSlug/events",
      async ({ params, query, request }) => {
        const ipKey = hashClientIp(request, deps.config) ?? "unknown";
        await deps.rateLimiter.checkAndIncrement({ ...EVENTS_IP_LIMIT, bucketKey: ipKey });

        const events = await deps.publicBoardReadService.getEvents(params.publicSlug, query.limit);

        if (!events) {
          throw notFoundError();
        }

        return apiSuccess({ events });
      },
      {
        query: t.Object({
          limit: t.Optional(t.Numeric({ minimum: 1 })),
        }),
      },
    )
    .post(
      "/api/public/boards/:publicSlug/entries",
      async ({ params, request, body }) => {
        const sessionToken = requireSessionToken(request.headers);
        const requestMeta = buildMutationRequestMeta(request, deps.config);
        const entry = await deps.queueMutationService.addEntry(
          params.publicSlug,
          sessionToken,
          body.displayName,
          requestMeta,
        );

        return apiSuccess({ entry });
      },
      {
        body: t.Object({
          displayName: t.String({ minLength: 1 }),
        }),
      },
    )
    .post("/api/public/boards/:publicSlug/entries/:entryId/remove", async ({ params, request }) => {
      const sessionToken = requireSessionToken(request.headers);
      const requestMeta = buildMutationRequestMeta(request, deps.config);
      const result = await deps.queueMutationService.removeEntry(
        params.publicSlug,
        sessionToken,
        params.entryId,
        requestMeta,
      );

      return apiSuccess(result);
    });
}
