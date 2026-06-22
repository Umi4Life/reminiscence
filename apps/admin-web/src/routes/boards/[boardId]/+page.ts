import {
  getBoard,
  getPublicBoardEvents,
  listVenues,
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
  let venueName: string | null = null;
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
      const venuesResult = await listVenues(fetch);
      const venue = venuesResult.venues.find((v) => v.id === board!.venueId);
      venueName = venue?.name ?? null;
    } catch {
      // venue name unavailable
    }

    try {
      const eventsResult = await getPublicBoardEvents(board.publicSlug, 20, fetch);
      events = eventsResult.events;
    } catch {
      // Events unavailable — render with empty list
    }
  }

  return { board, events, venueName, isNew, credential };
};
