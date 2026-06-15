import type { AppConfig } from "@queue-reminiscence/config";
import { Elysia } from "elysia";

import { readPublicBoardSessionToken } from "./public-access";
import { notFoundError, unauthorizedError } from "../http/errors";
import { AddEntryBody, EntryParams, EventsQuery, PublicSlugParams } from "../http/schemas";
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

function parseEventLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function requireSessionToken(headers: Headers): string {
  const token = readPublicBoardSessionToken(headers);

  if (!token) {
    throw unauthorizedError();
  }

  return token;
}

export function publicBoardsRoutes(deps: PublicBoardsRouteDeps) {
  return new Elysia({ name: "public-boards-routes" })
    .get(
      "/api/public/boards/:publicSlug",
      async ({ params, request }) => {
        const ipKey = hashClientIp(request, deps.config) ?? "unknown";
        await deps.rateLimiter.checkAndIncrement({ ...BOARD_READ_IP_LIMIT, bucketKey: ipKey });

        const sessionToken = readPublicBoardSessionToken(request.headers);
        const board = await deps.publicBoardReadService.getBoard(params.publicSlug, sessionToken);

        if (!board) {
          throw notFoundError();
        }

        return apiSuccess({ board });
      },
      {
        params: PublicSlugParams,
        detail: {
          summary: "Get board state",
          description:
            "Returns board state, active queue, and caller's mutation access status. Rate limit: 60 per min per IP.",
          tags: ["Public Boards"],
        },
      },
    )
    .get(
      "/api/public/boards/:publicSlug/events",
      async ({ params, query, request }) => {
        const ipKey = hashClientIp(request, deps.config) ?? "unknown";
        await deps.rateLimiter.checkAndIncrement({ ...EVENTS_IP_LIMIT, bucketKey: ipKey });

        const limit = parseEventLimit(typeof query.limit === "string" ? query.limit : undefined);
        const events = await deps.publicBoardReadService.getEvents(params.publicSlug, limit);

        if (!events) {
          throw notFoundError();
        }

        return apiSuccess({ events });
      },
      {
        params: PublicSlugParams,
        query: EventsQuery,
        detail: {
          summary: "Get recent board events",
          description: "Reverse-chronological event list. Rate limit: 30 per min per IP.",
          tags: ["Public Boards"],
        },
      },
    )
    .post(
      "/api/public/boards/:publicSlug/entries",
      async ({ params, request, body }) => {
        const sessionToken = requireSessionToken(request.headers);
        const displayName = body.displayName;
        const requestMeta = buildMutationRequestMeta(request, deps.config);
        const entry = await deps.queueMutationService.addEntry(
          params.publicSlug,
          sessionToken,
          displayName,
          requestMeta,
        );

        return apiSuccess({ entry });
      },
      {
        params: PublicSlugParams,
        body: AddEntryBody,
        detail: {
          summary: "Add queue entry",
          description:
            "Adds display name to queue. Rate limits: 3 adds per min per session, 10 per 10 min per session, 20 per 10 min per IP, 30 board-wide per min.",
          tags: ["Public Boards"],
          security: [{ PublicSession: [] }],
        },
      },
    )
    .post(
      "/api/public/boards/:publicSlug/entries/:entryId/remove",
      async ({ params, request }) => {
        const sessionToken = requireSessionToken(request.headers);
        const requestMeta = buildMutationRequestMeta(request, deps.config);
        const result = await deps.queueMutationService.removeEntry(
          params.publicSlug,
          sessionToken,
          params.entryId,
          requestMeta,
        );

        return apiSuccess(result);
      },
      {
        params: EntryParams,
        detail: {
          summary: "Remove queue entry",
          description:
            "Soft-removes an entry. Rate limits: 5 removes per min per session, 20 per 10 min per session.",
          tags: ["Public Boards"],
          security: [{ PublicSession: [] }],
        },
      },
    );
}
