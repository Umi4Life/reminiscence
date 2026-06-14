import type { AppConfig } from "@queue-reminiscence/config";
import { Elysia } from "elysia";

import { readPublicBoardSessionToken } from "./public-access";
import { notFoundError, unauthorizedError, validationError } from "../http/errors";
import { apiSuccess } from "../http/response";
import type { QueueMutationService } from "../queue/mutations";
import type { PublicBoardReadService } from "../queue/read";

export interface PublicBoardsRouteDeps {
  config: AppConfig;
  publicBoardReadService: PublicBoardReadService;
  queueMutationService: QueueMutationService;
}

interface AddEntryBody {
  displayName?: unknown;
}

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

function parseDisplayNameBody(body: unknown): string {
  const candidate = body as AddEntryBody | null;

  if (!candidate || typeof candidate.displayName !== "string") {
    throw validationError("Display name is required.");
  }

  return candidate.displayName;
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
    .get("/api/public/boards/:publicSlug", async ({ params, request }) => {
      const sessionToken = readPublicBoardSessionToken(request.headers);
      const board = await deps.publicBoardReadService.getBoard(params.publicSlug, sessionToken);

      if (!board) {
        throw notFoundError();
      }

      return apiSuccess({ board });
    })
    .get("/api/public/boards/:publicSlug/events", async ({ params, query }) => {
      const limit = parseEventLimit(typeof query.limit === "string" ? query.limit : undefined);
      const events = await deps.publicBoardReadService.getEvents(params.publicSlug, limit);

      if (!events) {
        throw notFoundError();
      }

      return apiSuccess({ events });
    })
    .post("/api/public/boards/:publicSlug/entries", async ({ params, request, body }) => {
      const sessionToken = requireSessionToken(request.headers);
      const displayName = parseDisplayNameBody(body);
      const entry = await deps.queueMutationService.addEntry(
        params.publicSlug,
        sessionToken,
        displayName,
        {},
      );

      return apiSuccess({ entry });
    })
    .post("/api/public/boards/:publicSlug/entries/:entryId/remove", async ({ params, request }) => {
      const sessionToken = requireSessionToken(request.headers);
      const result = await deps.queueMutationService.removeEntry(
        params.publicSlug,
        sessionToken,
        params.entryId,
        {},
      );

      return apiSuccess(result);
    });
}
