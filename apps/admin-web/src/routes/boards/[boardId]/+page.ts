import { getBoard, getPublicBoardEvents, type BoardSummary, type PublicBoardEvent } from "$lib/api";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ params, fetch }) => {
  let board: BoardSummary | null = null;
  let events: PublicBoardEvent[] = [];

  try {
    const result = await getBoard(params.boardId, fetch);
    board = result.board;
  } catch {
    // 404 or API error — page renders not-found state
  }

  if (board) {
    try {
      const eventsResult = await getPublicBoardEvents(board.publicSlug, 20, fetch);
      events = eventsResult.events;
    } catch {
      // Events unavailable — render with empty list
    }
  }

  return { board, events };
};
