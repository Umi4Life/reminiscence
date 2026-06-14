import type { BoardData, BoardEvent } from "$lib/api";
import { getBoard, getBoardEvents } from "$lib/api";
import type { PageLoad } from "./$types";

// Board mutation access depends on the HttpOnly API session cookie in the browser.
export const ssr = false;

export const load: PageLoad = async ({ params, fetch }) => {
  let board: BoardData | null = null;
  let events: BoardEvent[] = [];

  try {
    const result = await getBoard(params.publicSlug, fetch);
    board = result.board;
  } catch {
    // Board not found or API error — page renders friendly not-found state
  }

  if (board) {
    try {
      const eventsResult = await getBoardEvents(params.publicSlug, 20, fetch);
      events = eventsResult.events;
    } catch {
      // Events unavailable — render with empty list
    }
  }

  return { board, events };
};
