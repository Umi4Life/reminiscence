import type { AppConfig } from "@queue-reminiscence/config";
import type { Database, DbTransaction, QueueEntry } from "@queue-reminiscence/db";
import { auditMetadata, boardEvents, boards, queueEntries } from "@queue-reminiscence/db/schema";
import { validateDisplayName } from "@queue-reminiscence/domain";
import { and, asc, eq, sql } from "drizzle-orm";

import { entryAddedPublicMessage, entryRemovedPublicMessage } from "../admin/board-event-messages";
import { lockBoardRow } from "../admin/board-context";
import type { PublicSessionService } from "../auth/public-sessions";
import {
  ApiError,
  forbiddenError,
  notFoundError,
  unauthorizedError,
  validationError,
} from "../http/errors";
import { derivePositions } from "./read";

export interface MutationRequestMeta {
  ipHash?: string | null;
  userAgentHash?: string | null;
}

export interface PublicQueueEntryResult {
  id: string;
  displayName: string;
  position: number;
  sortOrder: number;
  status: QueueEntry["status"];
  createdAt: Date;
}

export interface QueueMutationService {
  addEntry(
    publicSlug: string,
    sessionToken: string,
    displayName: string,
    requestMeta: MutationRequestMeta,
  ): Promise<PublicQueueEntryResult>;

  removeEntry(
    publicSlug: string,
    sessionToken: string,
    entryId: string,
    requestMeta: MutationRequestMeta,
  ): Promise<{ entryId: string; removed: true }>;
}

function allowsPublicMutation(policy: "access_code_required" | "staff_only" | "disabled"): boolean {
  return policy === "access_code_required";
}

async function resolveSessionForBoard(
  publicSessionService: PublicSessionService,
  publicSlug: string,
  sessionToken: string,
) {
  try {
    const session = await publicSessionService.resolveSession(sessionToken);
    if (session.board.publicSlug !== publicSlug) {
      throw unauthorizedError();
    }

    return session;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw unauthorizedError();
  }
}

async function insertAuditMetadata(
  tx: DbTransaction,
  eventId: string,
  publicSessionId: string,
  requestMeta: MutationRequestMeta,
): Promise<void> {
  await tx.insert(auditMetadata).values({
    eventId,
    ipHash: requestMeta.ipHash ?? null,
    userAgentHash: requestMeta.userAgentHash ?? null,
    publicSessionId,
  });
}

async function incrementBoardCounters(tx: DbTransaction, boardId: string): Promise<void> {
  await tx
    .update(boards)
    .set({
      nextSortOrder: sql`${boards.nextSortOrder} + 1`,
      displayVersion: sql`${boards.displayVersion} + 1`,
    })
    .where(eq(boards.id, boardId));
}

async function incrementDisplayVersionOnly(tx: DbTransaction, boardId: string): Promise<void> {
  await tx
    .update(boards)
    .set({
      displayVersion: sql`${boards.displayVersion} + 1`,
    })
    .where(eq(boards.id, boardId));
}

async function deriveEntryPosition(
  tx: DbTransaction,
  boardId: string,
  entryId: string,
): Promise<number> {
  const activeEntries = await tx
    .select({
      id: queueEntries.id,
      displayName: queueEntries.displayName,
      sortOrder: queueEntries.sortOrder,
      createdAt: queueEntries.createdAt,
    })
    .from(queueEntries)
    .where(and(eq(queueEntries.boardId, boardId), eq(queueEntries.status, "active")))
    .orderBy(asc(queueEntries.sortOrder));

  const positioned = derivePositions(activeEntries);
  const entry = positioned.find((candidate) => candidate.id === entryId);

  if (!entry) {
    throw new Error("Inserted queue entry is missing from active queue.");
  }

  return entry.position;
}

export function createDbQueueMutationService(
  db: Database,
  _config: AppConfig,
  publicSessionService: PublicSessionService,
): QueueMutationService {
  return {
    async addEntry(publicSlug, sessionToken, displayName, requestMeta) {
      // TODO(phase-8): apply rate limits

      const session = await resolveSessionForBoard(publicSessionService, publicSlug, sessionToken);
      const validatedName = validateDisplayName(displayName);

      if (!validatedName.ok) {
        throw validationError(validatedName.message);
      }

      return db.transaction(async (tx) => {
        const board = await lockBoardRow(tx, session.board.id);

        if (!board || board.publicSlug !== publicSlug) {
          throw notFoundError();
        }

        if (board.status !== "open") {
          throw forbiddenError("This board is closed.");
        }

        if (!allowsPublicMutation(board.publicAddPolicy)) {
          throw forbiddenError("Public queue adds are not allowed on this board.");
        }

        const sortOrder = board.nextSortOrder;

        const [entry] = await tx
          .insert(queueEntries)
          .values({
            boardId: board.id,
            displayName: validatedName.value,
            sortOrder,
            status: "active",
          })
          .returning();

        if (!entry) {
          throw new Error("Queue entry insert failed.");
        }

        const [event] = await tx
          .insert(boardEvents)
          .values({
            boardId: board.id,
            actorType: "public",
            type: "entry_added",
            entryId: entry.id,
            displayNameSnapshot: validatedName.value,
            publicMessage: entryAddedPublicMessage(validatedName.value),
          })
          .returning();

        if (!event) {
          throw new Error("Board event insert failed.");
        }

        await insertAuditMetadata(tx, event.id, session.session.id, requestMeta);
        await incrementBoardCounters(tx, board.id);

        const position = await deriveEntryPosition(tx, board.id, entry.id);

        return {
          id: entry.id,
          displayName: entry.displayName,
          position,
          sortOrder: entry.sortOrder,
          status: entry.status,
          createdAt: entry.createdAt,
        };
      });
    },

    async removeEntry(publicSlug, sessionToken, entryId, requestMeta) {
      // TODO(phase-8): apply rate limits

      const session = await resolveSessionForBoard(publicSessionService, publicSlug, sessionToken);

      return db.transaction(async (tx) => {
        const board = await lockBoardRow(tx, session.board.id);

        if (!board || board.publicSlug !== publicSlug) {
          throw notFoundError();
        }

        if (board.status !== "open") {
          throw forbiddenError("This board is closed.");
        }

        if (!allowsPublicMutation(board.publicRemovePolicy)) {
          throw forbiddenError("Public queue removals are not allowed on this board.");
        }

        const [entry] = await tx
          .select()
          .from(queueEntries)
          .where(and(eq(queueEntries.id, entryId), eq(queueEntries.boardId, board.id)))
          .limit(1);

        if (!entry) {
          throw notFoundError();
        }

        if (entry.status !== "active") {
          throw validationError("This entry is no longer in the queue.");
        }

        const [event] = await tx
          .insert(boardEvents)
          .values({
            boardId: board.id,
            actorType: "public",
            type: "entry_removed",
            entryId: entry.id,
            displayNameSnapshot: entry.displayName,
            publicMessage: entryRemovedPublicMessage(entry.displayName),
          })
          .returning();

        if (!event) {
          throw new Error("Board event insert failed.");
        }

        const now = new Date();

        await tx
          .update(queueEntries)
          .set({
            status: "removed",
            removedAt: now,
            removedByEventId: event.id,
          })
          .where(eq(queueEntries.id, entry.id));

        await insertAuditMetadata(tx, event.id, session.session.id, requestMeta);
        await incrementDisplayVersionOnly(tx, board.id);

        return {
          entryId: entry.id,
          removed: true as const,
        };
      });
    },
  };
}
