import {
  listOrganizations,
  listVenues,
  type OrganizationSummary,
  type VenueSummary,
} from "$lib/api";
import { requireSession } from "$lib/session";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ fetch, parent }) => {
  const { session } = await parent();
  requireSession(session);

  // Both endpoints are already RBAC-scoped server-side: super sees all; org_owner
  // sees their org(s) and venues; venue_manager sees their venue(s) and org. They
  // return an empty list (never 403) when the caller has no access.
  let organizations: OrganizationSummary[] = [];
  let venues: VenueSummary[] = [];

  try {
    organizations = (await listOrganizations(fetch)).organizations;
  } catch {
    // organizations stays empty
  }

  try {
    venues = (await listVenues(fetch)).venues;
  } catch {
    // venues stays empty
  }

  return { organizations, venues };
};
