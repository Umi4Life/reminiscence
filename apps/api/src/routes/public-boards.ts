import type { AppConfig } from "@queue-reminiscence/config";
import { Elysia } from "elysia";

import type { PublicSessionService } from "../auth/public-sessions";
import { forbiddenError, notFoundError, validationError } from "../http/errors";
import { apiSuccess } from "../http/response";
import type { PublicBoardReadService } from "../public/board-read";
import { readPublicBoardSessionToken } from "./public-access";

export interface PublicBoardsRouteDeps {
  config: AppConfig;
  publicBoardReadService: PublicBoardReadService;
  publicSessionService: PublicSessionService;
}

function parseEventsLimit(raw: string | undefined): number {
  if (raw === undefined) {
    return 20;
  }

  const limit = Number.parseInt(raw, 10);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw validationError("limit must be an integer between 1 and 100.");
  }

  return limit;
}

export function publicBoardsRoutes(deps: PublicBoardsRouteDeps) {
  return new Elysia({ name: "public-boards-routes" })
    .get("/api/public/boards/:publicSlug", async ({ params, request }) => {
      const sessionToken = readPublicBoardSessionToken(request.headers);
      const result = await deps.publicBoardReadService.getBoardByPublicSlug(
        params.publicSlug,
        sessionToken,
      );

      if (result.status === "not_found") {
        throw notFoundError();
      }

      if (result.status === "forbidden") {
        throw forbiddenError();
      }

      return apiSuccess(result.board);
    })
    .get("/api/public/boards/:publicSlug/events", async ({ params, query }) => {
      const limit = parseEventsLimit(query.limit);
      const result = await deps.publicBoardReadService.listRecentEvents(params.publicSlug, limit);

      if (result.status === "not_found") {
        throw notFoundError();
      }

      if (result.status === "forbidden") {
        throw forbiddenError();
      }

      return apiSuccess({ events: result.events });
    });
}
