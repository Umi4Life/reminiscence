import type { Board, Database, DbTransaction } from "@queue-reminiscence/db";
import { boardEvents, boards, queueEntries } from "@queue-reminiscence/db/schema";
import { and, eq, sql } from "drizzle-orm";

import { assertCanOperateBoard, type AdminRbacContext } from "../auth/rbac";
import { loadBoardWithResourceContext, lockBoardRow } from "../boards/board-context";
import {
  BOARD_CLOSED_PUBLIC_MESSAGE,
  BOARD_OPENED_PUBLIC_MESSAGE,
  BOARD_RESET_PUBLIC_MESSAGE,
} from "./board-event-messages";
import type { BoardSummary } from "./board-management";
import { toBoardSummaryFromRow } from "./board-management";

export type BoardOperationActor = {
  adminUserId: string;
};

export type BoardOperationResult = {
  board: BoardSummary;
  changed: boolean;
};

type BoardMutationResult = {
  board: Board;
  changed: boolean;
};

function isBoardAlreadyOpen(board: Pick<Board, "status">): boolean {
  return board.status === "open";
}

function isBoardAlreadyClosed(board: Pick<Board, "status">): boolean {
  return board.status === "closed";
}

async function incrementDisplayVersion(
  tx: DbTransaction,
  boardId: string,
  patch: Partial<Pick<Board, "status">>,
): Promise<Board> {
  const [board] = await tx
    .update(boards)
    .set({
      ...patch,
      displayVersion: sql`${boards.displayVersion} + 1`,
    })
    .where(eq(boards.id, boardId))
    .returning();

  if (!board) {
    throw new Error(`Board ${boardId} disappeared during operation`);
  }

  return board;
}

async function openBoardInTransaction(
  tx: DbTransaction,
  boardId: string,
  actor: BoardOperationActor,
): Promise<BoardMutationResult> {
  const locked = await lockBoardRow(tx, boardId);

  if (!locked) {
    throw new Error(`Board ${boardId} not found`);
  }

  if (isBoardAlreadyOpen(locked)) {
    return { board: locked, changed: false };
  }

  await tx.insert(boardEvents).values({
    boardId,
    actorType: "admin",
    actorAdminUserId: actor.adminUserId,
    type: "board_opened",
    publicMessage: BOARD_OPENED_PUBLIC_MESSAGE,
  });

  const board = await incrementDisplayVersion(tx, boardId, { status: "open" });

  return { board, changed: true };
}

async function closeBoardInTransaction(
  tx: DbTransaction,
  boardId: string,
  actor: BoardOperationActor,
): Promise<BoardMutationResult> {
  const locked = await lockBoardRow(tx, boardId);

  if (!locked) {
    throw new Error(`Board ${boardId} not found`);
  }

  if (isBoardAlreadyClosed(locked)) {
    return { board: locked, changed: false };
  }

  await tx.insert(boardEvents).values({
    boardId,
    actorType: "admin",
    actorAdminUserId: actor.adminUserId,
    type: "board_closed",
    publicMessage: BOARD_CLOSED_PUBLIC_MESSAGE,
  });

  const board = await incrementDisplayVersion(tx, boardId, { status: "closed" });

  return { board, changed: true };
}

async function resetBoardInTransaction(
  tx: DbTransaction,
  boardId: string,
  actor: BoardOperationActor,
): Promise<BoardMutationResult> {
  const locked = await lockBoardRow(tx, boardId);

  if (!locked) {
    throw new Error(`Board ${boardId} not found`);
  }

  const [event] = await tx
    .insert(boardEvents)
    .values({
      boardId,
      actorType: "admin",
      actorAdminUserId: actor.adminUserId,
      type: "board_reset",
      publicMessage: BOARD_RESET_PUBLIC_MESSAGE,
    })
    .returning();

  const now = new Date();

  await tx
    .update(queueEntries)
    .set({
      status: "removed",
      removedAt: now,
      removedByEventId: event.id,
    })
    .where(and(eq(queueEntries.boardId, boardId), eq(queueEntries.status, "active")));

  const board = await incrementDisplayVersion(tx, boardId, {});

  return { board, changed: true };
}

async function runBoardOperation(
  db: Database,
  rbac: AdminRbacContext,
  adminUserId: string,
  boardId: string,
  operation: (
    tx: DbTransaction,
    lockedBoardId: string,
    actor: BoardOperationActor,
  ) => Promise<BoardMutationResult>,
): Promise<BoardOperationResult | null> {
  const context = await loadBoardWithResourceContext(db, boardId);

  if (!context) {
    return null;
  }

  assertCanOperateBoard(rbac, context);

  const mutation = await db.transaction((tx) =>
    operation(tx, boardId, {
      adminUserId,
    }),
  );

  return {
    board: toBoardSummaryFromRow(mutation.board, context.venue),
    changed: mutation.changed,
  };
}

export async function openBoard(
  db: Database,
  rbac: AdminRbacContext,
  adminUserId: string,
  boardId: string,
): Promise<BoardOperationResult | null> {
  return runBoardOperation(db, rbac, adminUserId, boardId, openBoardInTransaction);
}

export async function closeBoard(
  db: Database,
  rbac: AdminRbacContext,
  adminUserId: string,
  boardId: string,
): Promise<BoardOperationResult | null> {
  return runBoardOperation(db, rbac, adminUserId, boardId, closeBoardInTransaction);
}

export async function resetBoard(
  db: Database,
  rbac: AdminRbacContext,
  adminUserId: string,
  boardId: string,
): Promise<BoardOperationResult | null> {
  return runBoardOperation(db, rbac, adminUserId, boardId, resetBoardInTransaction);
}
