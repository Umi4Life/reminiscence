import { listOrganizations, type OrganizationSummary } from "$lib/api";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ fetch }) => {
  let organizations: OrganizationSummary[] = [];

  try {
    // ponytail: limit:100 for org selector; add listAll helper if portals exceed 100 orgs
    const result = await listOrganizations(fetch, { limit: 100 });
    organizations = result.organizations;
  } catch {
    // stays empty; form shows error state
  }

  return { organizations };
};
