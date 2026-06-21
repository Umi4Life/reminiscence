import {
  getAdmin,
  listAdmins,
  listOrganizations,
  listVenues,
  type AdminUserSummary,
  type OrganizationSummary,
  type VenueSummary,
} from "$lib/api";
import { requireSession } from "$lib/session";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { session } = await parent();
  requireSession(session);

  let admin: AdminUserSummary | null = null;
  let organizations: OrganizationSummary[] = [];
  let venues: VenueSummary[] = [];

  if (session?.admin.isSuperAdmin) {
    try {
      const result = await getAdmin(params.adminId, fetch);
      admin = result.admin;
    } catch {
      // admin stays null; page shows not-found state
    }

    try {
      const orgsResult = await listOrganizations(fetch);
      organizations = orgsResult.organizations;
    } catch {
      // orgs stays empty
    }

    try {
      const venuesResult = await listVenues(fetch);
      venues = venuesResult.venues;
    } catch {
      // venues stays empty
    }
  } else if (
    session?.memberships.some((m) => m.role === "org_owner" || m.role === "venue_manager")
  ) {
    // Org-owners and venue-managers: the admin/org/venue endpoints are already
    // RBAC-scoped server-side, so no client-side filtering is needed.
    try {
      const result = await listAdmins(fetch);
      admin = result.admins.find((a) => a.id === params.adminId) ?? null;
    } catch {
      // admin stays null
    }

    try {
      organizations = (await listOrganizations(fetch)).organizations;
    } catch {
      // orgs stays empty
    }

    try {
      venues = (await listVenues(fetch)).venues;
    } catch {
      // venues stays empty
    }
  }

  return { admin, organizations, venues };
};
