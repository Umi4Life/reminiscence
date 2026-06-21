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
  let organizations: OrganizationSummary[] = [];

  try {
    const [boardsResult, organizationsResult] = await Promise.all([
      listBoards(fetch),
      listOrganizations(fetch),
    ]);
    boards = boardsResult.boards;
    organizations = organizationsResult.organizations;
  } catch {
    // boards stays empty on error; page shows error state
  }

  return { boards, organizations };
};
