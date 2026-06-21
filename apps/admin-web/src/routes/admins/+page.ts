import { listAdmins, type AdminUserSummary } from "$lib/api";
import { requireSession } from "$lib/session";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ fetch, parent }) => {
  const { session } = await parent();
  requireSession(session);

  let admins: AdminUserSummary[] = [];

  const canManage =
    session?.admin.isSuperAdmin ||
    session?.memberships.some((m) => m.role === "org_owner" || m.role === "venue_manager");

  if (canManage) {
    try {
      const result = await listAdmins(fetch);
      admins = result.admins;
    } catch {
      // admins stays empty; page shows error state
    }
  }

  return { admins };
};
