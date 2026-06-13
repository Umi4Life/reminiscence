import { Elysia } from "elysia";

import type { BoardManagementService } from "../admin/board-management";
import type { AdminAuthService } from "../auth/admin-sessions";
import { requireAdminSession } from "../auth/admin-route-auth";
import { apiSuccess } from "../http/response";

export interface AdminOrganizationsRouteDeps {
  authService: AdminAuthService;
  boardManagementService: BoardManagementService;
}

export function adminOrganizationsRoutes(deps: AdminOrganizationsRouteDeps) {
  return new Elysia({ name: "admin-organizations-routes" }).get(
    "/api/admin/organizations",
    async ({ request }) => {
      const session = await requireAdminSession(deps.authService, request.headers);
      const organizations = await deps.boardManagementService.listOrganizations({
        memberships: session.memberships,
      });

      return apiSuccess({ organizations });
    },
  );
}
