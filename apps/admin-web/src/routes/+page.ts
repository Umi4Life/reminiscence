import {
  listBoards,
  listOrganizations,
  type BoardSummary,
  type OrganizationSummary,
} from "$lib/api";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ fetch }) => {
  let boards: BoardSummary[] = [];
  let boardsNextCursor: string | null = null;
  let organizations: OrganizationSummary[] = [];

  try {
    const [boardsResult, organizationsResult] = await Promise.all([
      listBoards(fetch),
      listOrganizations(fetch),
    ]);
    boards = boardsResult.boards;
    boardsNextCursor = boardsResult.nextCursor;
    organizations = organizationsResult.organizations;
  } catch {
    // boards stays empty on error; page shows error state
  }

  return { boards, boardsNextCursor, organizations };
};
