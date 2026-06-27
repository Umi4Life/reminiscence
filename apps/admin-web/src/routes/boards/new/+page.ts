import { listVenues, type VenueSummary } from "$lib/api";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ fetch }) => {
  let venues: VenueSummary[] = [];

  try {
    // ponytail: limit:100 for venue selector; add listAll helper if portals exceed 100 venues
    const result = await listVenues(fetch, { limit: 100 });
    venues = result.venues;
  } catch {
    // venues stays empty; form shows error state
  }

  return { venues };
};
