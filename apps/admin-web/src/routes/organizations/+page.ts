import { listOrganizations, type OrganizationSummary } from "$lib/api";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ fetch }) => {
  let organizations: OrganizationSummary[] = [];
  let nextCursor: string | null = null;

  try {
    const result = await listOrganizations(fetch);
    organizations = result.organizations;
    nextCursor = result.nextCursor;
  } catch {
    // stays empty; page shows error state
  }

  return { organizations, nextCursor };
};
