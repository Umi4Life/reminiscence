import type { AppConfig } from "@queue-reminiscence/config";
import type { Board, Database } from "@queue-reminiscence/db";
import {
  boardEvents,
  boards,
  organizations,
  queueEntries,
  venues,
} from "@queue-reminiscence/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";

import type { PublicSessionService } from "../auth/public-sessions";

export interface PublicBoardOrganizationContext {
  id: string;
  slug: string;
  name: string;
}

export interface PublicBoardVenueContext {
  id: string;
  slug: string;
  name: string;
}

export interface PublicBoardQueueEntry {
  id: string;
  displayName: string;
  position: number;
  sortOrder: number;
  createdAt: Date;
}

export interface PublicBoardMutationAccess {
  available: boolean;
  expiresAt: Date | null;
  canAdd: boolean;
  canRemove: boolean;
}

export interface PublicBoardReadData {
  organization: PublicBoardOrganizationContext;
  venue: PublicBoardVenueContext;
  board: {
    publicSlug: string;
    name: string;
    description: string | null;
    status: Board["status"];
    publicAddPolicy: Board["publicAddPolicy"];
    publicRemovePolicy: Board["publicRemovePolicy"];
    displayVersion: number;
    updatedAt: Date;
  };
  queue: PublicBoardQueueEntry[];
  mutationAccess: PublicBoardMutationAccess;
}

export interface PublicBoardEventItem {
  id: string;
  type: (typeof boardEvents.$inferSelect)["type"];
  publicMessage: string;
  displayNameSnapshot: string | null;
  createdAt: Date;
}

export interface PublicBoardReadService {
  getBoard(publicSlug: string, sessionToken?: string): Promise<PublicBoardReadData | null>;
  getEvents(publicSlug: string, limit?: number): Promise<PublicBoardEventItem[] | null>;
}

const defaultEventLimit = 20;

function allowsPublicMutation(policy: Board["publicAddPolicy"]): boolean {
  return policy === "access_code_required";
}

function derivePositions(
  entries: Array<{
    id: string;
    displayName: string;
    sortOrder: number;
    createdAt: Date;
  }>,
): PublicBoardQueueEntry[] {
  return [...entries]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((entry, index) => ({
      id: entry.id,
      displayName: entry.displayName,
      sortOrder: entry.sortOrder,
      createdAt: entry.createdAt,
      position: index + 1,
    }));
}

function mutationAccessFor(board: Board, sessionExpiresAt: Date | null): PublicBoardMutationAccess {
  const boardOpen = board.status === "open";
  const available = sessionExpiresAt !== null;

  return {
    available,
    expiresAt: sessionExpiresAt,
    canAdd: available && boardOpen && allowsPublicMutation(board.publicAddPolicy),
    canRemove: available && boardOpen && allowsPublicMutation(board.publicRemovePolicy),
  };
}

export function createDbPublicBoardReadService(
  db: Database,
  _config: AppConfig,
  publicSessionService: PublicSessionService,
): PublicBoardReadService {
  return {
    async getBoard(publicSlug, sessionToken) {
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

      if (!row) {
        return null;
      }

      const activeEntries = await db
        .select({
          id: queueEntries.id,
          displayName: queueEntries.displayName,
          sortOrder: queueEntries.sortOrder,
          createdAt: queueEntries.createdAt,
        })
        .from(queueEntries)
        .where(and(eq(queueEntries.boardId, row.board.id), eq(queueEntries.status, "active")))
        .orderBy(asc(queueEntries.sortOrder));

      let sessionExpiresAt: Date | null = null;

      if (sessionToken) {
        try {
          const session = await publicSessionService.resolveSession(sessionToken);

          if (session.board.publicSlug === publicSlug) {
            sessionExpiresAt = session.session.expiresAt;
          }
        } catch {
          sessionExpiresAt = null;
        }
      }

      return {
        organization: {
          id: row.organization.id,
          slug: row.organization.slug,
          name: row.organization.name,
        },
        venue: {
          id: row.venue.id,
          slug: row.venue.slug,
          name: row.venue.name,
        },
        board: {
          publicSlug: row.board.publicSlug,
          name: row.board.name,
          description: row.board.description,
          status: row.board.status,
          publicAddPolicy: row.board.publicAddPolicy,
          publicRemovePolicy: row.board.publicRemovePolicy,
          displayVersion: row.board.displayVersion,
          updatedAt: row.board.updatedAt,
        },
        queue: derivePositions(activeEntries),
        mutationAccess: mutationAccessFor(row.board, sessionExpiresAt),
      };
    },

    async getEvents(publicSlug, limit = defaultEventLimit) {
      const [board] = await db
        .select({ id: boards.id })
        .from(boards)
        .where(eq(boards.publicSlug, publicSlug))
        .limit(1);

      if (!board) {
        return null;
      }

      const events = await db
        .select({
          id: boardEvents.id,
          type: boardEvents.type,
          publicMessage: boardEvents.publicMessage,
          displayNameSnapshot: boardEvents.displayNameSnapshot,
          createdAt: boardEvents.createdAt,
        })
        .from(boardEvents)
        .where(eq(boardEvents.boardId, board.id))
        .orderBy(desc(boardEvents.createdAt))
        .limit(limit);

      return events;
    },
  };
}

export { derivePositions };
