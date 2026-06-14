import { listBoards, type BoardSummary } from "$lib/api";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ fetch }) => {
  let boards: BoardSummary[] = [];

  try {
    const result = await listBoards(fetch);
    boards = result.boards;
  } catch {
    // boards stays empty on error; page shows error state
  }

  return { boards };
};
