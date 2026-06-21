import type { BoardData, BoardEvent } from "$lib/api";
import { getBoard, getBoardEvents } from "$lib/api";
import type { PageLoad } from "./$types";

// Board mutation access depends on the HttpOnly API session cookie in the browser.
export const ssr = false;

export const load: PageLoad = async ({ params, url, fetch }) => {
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

  // When we arrive straight from a successful claim (`?claimed=1`) but the board
  // read reports no session (`mutationAccess.available === false`), the session
  // cookie was issued by the API yet did not come back on this request — i.e. the
  // browser is blocking cookies for this site. `available` reflects only whether a
  // session resolved server-side, independent of board policy or open/closed
  // state, so it is a precise signal with no false positives from policy.
  const cookiesBlocked =
    url.searchParams.get("claimed") === "1" && board !== null && !board.mutationAccess.available;

  return { board, events, cookiesBlocked };
};
