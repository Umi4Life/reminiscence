import type { Board, Database, DbTransaction } from "@queue-reminiscence/db";
import { boards, venues } from "@queue-reminiscence/db/schema";
import { eq } from "drizzle-orm";

import type { BoardResourceContext } from "../auth/rbac";

export type BoardWithResourceContext = BoardResourceContext & {
  board: Board;
};

type DbLike = Database | DbTransaction;

export async function loadBoardWithResourceContext(
  db: DbLike,
  boardId: string,
): Promise<BoardWithResourceContext | null> {
  const [row] = await db
    .select({ board: boards, venue: venues })
    .from(boards)
    .innerJoin(venues, eq(boards.venueId, venues.id))
    .where(eq(boards.id, boardId))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    boardId: row.board.id,
    venueId: row.venue.id,
    organizationId: row.venue.organizationId,
    board: row.board,
  };
}

export async function lockBoardRow(tx: DbTransaction, boardId: string): Promise<Board | null> {
  const [board] = await tx
    .select()
    .from(boards)
    .where(eq(boards.id, boardId))
    .for("update")
    .limit(1);

  return board ?? null;
}
