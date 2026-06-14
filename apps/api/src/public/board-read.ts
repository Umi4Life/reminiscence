import type { AppConfig } from "@queue-reminiscence/config";
import type { Board, BoardEvent, Database } from "@queue-reminiscence/db";
import {
  boardEvents,
  boards,
  organizations,
  queueEntries,
  venues,
} from "@queue-reminiscence/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";

import {
  createDbPublicSessionService,
  type PublicBoardSessionContext,
  type PublicSessionService,
} from "../auth/public-sessions";

export interface PublicBoardSummary {
  publicSlug: string;
  name: string;
  status: Board["status"];
  venueName: string;
  organizationName: string;
}

export interface PublicQueueEntry {
  position: number;
  displayName: string;
}

export interface PublicBoardRead {
  board: PublicBoardSummary;
  queue: PublicQueueEntry[];
  queueLength: number;
  displayVersion: number;
  updatedAt: Date;
  canMutate: boolean;
  mutationAccessExpiresAt?: Date;
}

export interface PublicBoardEventSummary {
  type: BoardEvent["type"];
  publicMessage: string;
  createdAt: Date;
  displayNameSnapshot?: string | null;
}

export type GetPublicBoardResult =
  | { status: "ok"; board: PublicBoardRead }
  | { status: "not_found" }
  | { status: "forbidden" };

export type ListPublicBoardEventsResult =
  | { status: "ok"; events: PublicBoardEventSummary[] }
  | { status: "not_found" }
  | { status: "forbidden" };

export interface PublicBoardReadService {
  getBoardByPublicSlug(publicSlug: string, sessionToken?: string): Promise<GetPublicBoardResult>;
  listRecentEvents(publicSlug: string, limit?: number): Promise<ListPublicBoardEventsResult>;
}

type BoardContextRow = {
  board: Board;
  venue: { name: string };
  organization: { name: string };
};

async function loadBoardContextByPublicSlug(
  db: Database,
  publicSlug: string,
): Promise<BoardContextRow | null> {
  const [row] = await db
    .select({
      board: boards,
      venue: venues,
      organization: organizations,
    })
    .from(boards)
    .innerJoin(venues, eq(boards.venueId, venues.id))
    .innerJoin(organizations, eq(venues.organizationId, organizations.id))
    .where(eq(boards.publicSlug, publicSlug))
    .limit(1);

  return row ?? null;
}

async function resolveOptionalSession(
  publicSessionService: PublicSessionService,
  sessionToken?: string,
): Promise<PublicBoardSessionContext | null> {
  if (!sessionToken) {
    return null;
  }

  try {
    return await publicSessionService.resolveSession(sessionToken);
  } catch {
    return null;
  }
}

function sessionAllowsPublicView(
  board: Board,
  publicSlug: string,
  session: PublicBoardSessionContext | null,
): boolean {
  if (board.publicViewPolicy === "open") {
    return true;
  }

  return session?.board.publicSlug === publicSlug;
}

function toPublicBoardSummary(row: BoardContextRow): PublicBoardSummary {
  return {
    publicSlug: row.board.publicSlug,
    name: row.board.name,
    status: row.board.status,
    venueName: row.venue.name,
    organizationName: row.organization.name,
  };
}

export function createDbPublicBoardReadService(
  db: Database,
  config: AppConfig,
): PublicBoardReadService {
  const publicSessionService = createDbPublicSessionService(db, config);

  return {
    async getBoardByPublicSlug(publicSlug, sessionToken) {
      const row = await loadBoardContextByPublicSlug(db, publicSlug);

      if (!row) {
        return { status: "not_found" };
      }

      const session = await resolveOptionalSession(publicSessionService, sessionToken);

      if (!sessionAllowsPublicView(row.board, publicSlug, session)) {
        return { status: "forbidden" };
      }

      const activeEntries = await db
        .select({
          displayName: queueEntries.displayName,
        })
        .from(queueEntries)
        .where(and(eq(queueEntries.boardId, row.board.id), eq(queueEntries.status, "active")))
        .orderBy(asc(queueEntries.sortOrder));

      const queue = activeEntries.map((entry, index) => ({
        position: index + 1,
        displayName: entry.displayName,
      }));

      const canMutate = session?.board.publicSlug === publicSlug;

      return {
        status: "ok",
        board: {
          board: toPublicBoardSummary(row),
          queue,
          queueLength: queue.length,
          displayVersion: row.board.displayVersion,
          updatedAt: row.board.updatedAt,
          canMutate,
          ...(canMutate ? { mutationAccessExpiresAt: session!.session.expiresAt } : {}),
        },
      };
    },

    async listRecentEvents(publicSlug, limit = 20) {
      const row = await loadBoardContextByPublicSlug(db, publicSlug);

      if (!row) {
        return { status: "not_found" };
      }

      if (row.board.publicViewPolicy === "access_code_required") {
        return { status: "forbidden" };
      }

      const events = await db
        .select({
          type: boardEvents.type,
          publicMessage: boardEvents.publicMessage,
          createdAt: boardEvents.createdAt,
          displayNameSnapshot: boardEvents.displayNameSnapshot,
        })
        .from(boardEvents)
        .where(eq(boardEvents.boardId, row.board.id))
        .orderBy(desc(boardEvents.createdAt))
        .limit(limit);

      return {
        status: "ok",
        events: events.map((event) => ({
          type: event.type,
          publicMessage: event.publicMessage,
          createdAt: event.createdAt,
          ...(event.displayNameSnapshot ? { displayNameSnapshot: event.displayNameSnapshot } : {}),
        })),
      };
    },
  };
}
