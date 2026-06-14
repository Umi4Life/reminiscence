import { listVenues, type VenueSummary } from "$lib/api";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ fetch }) => {
  let venues: VenueSummary[] = [];

  try {
    const result = await listVenues(fetch);
    venues = result.venues;
  } catch {
    // venues stays empty; form shows error state
  }

  return { venues };
};
