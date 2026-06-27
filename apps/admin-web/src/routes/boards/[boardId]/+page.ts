import {
  getBoard,
  getPublicBoardEvents,
  type BoardSummary,
  type PublicBoardEvent,
  type RotatedBoardAccessCredential,
} from "$lib/api";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ params, fetch, url }) => {
  const isNew = url.searchParams.get("new") === "1";
  let board: BoardSummary | null = null;
  let events: PublicBoardEvent[] = [];
  let credential: RotatedBoardAccessCredential | null = null;

  try {
    const result = await getBoard(params.boardId, fetch);
    board = result.board;
    credential = result.credential;
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

  // board.venueName is included in BoardSummary; no separate venue lookup needed
  return { board, events, venueName: board?.venueName ?? null, isNew, credential };
};
