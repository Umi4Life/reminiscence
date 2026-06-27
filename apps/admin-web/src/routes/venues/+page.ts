import { listVenues, type VenueSummary } from "$lib/api";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ fetch }) => {
  let venues: VenueSummary[] = [];
  let nextCursor: string | null = null;

  try {
    const result = await listVenues(fetch);
    venues = result.venues;
    nextCursor = result.nextCursor;
  } catch {
    // venues stays empty; page shows error state
  }

  return { venues, nextCursor };
};
