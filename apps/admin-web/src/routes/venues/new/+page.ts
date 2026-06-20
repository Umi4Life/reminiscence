import { listOrganizations, type OrganizationSummary } from "$lib/api";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ fetch }) => {
  let organizations: OrganizationSummary[] = [];

  try {
    const result = await listOrganizations(fetch);
    organizations = result.organizations;
  } catch {
    // stays empty; form shows error state
  }

  return { organizations };
};
