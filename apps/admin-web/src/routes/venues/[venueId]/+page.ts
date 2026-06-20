import { getVenue, type VenueSummary } from "$lib/api";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ params, fetch }) => {
  let venue: VenueSummary | null = null;

  try {
    const result = await getVenue(params.venueId, fetch);
    venue = result.venue;
  } catch {
    // venue stays null; page shows error state
  }

  return { venue };
};
