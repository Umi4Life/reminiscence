import { listOrganizations, type OrganizationSummary } from "$lib/api";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ params, fetch }) => {
  let organization: OrganizationSummary | null = null;

  try {
    // ponytail: limit:100 covers most admin portals; a dedicated getOrg endpoint would be cleaner
    const result = await listOrganizations(fetch, { limit: 100 });
    organization = result.organizations.find((o) => o.id === params.orgId) ?? null;
  } catch {
    // stays null; page shows not-found state
  }

  return { organization };
};
