import { Elysia } from "elysia";

import type { BoardManagementService } from "../admin/board-management";
import type { AdminAuthService } from "../auth/admin-sessions";
import { requireAdminSession } from "../auth/admin-route-auth";
import { apiSuccess } from "../http/response";

export interface AdminVenuesRouteDeps {
  authService: AdminAuthService;
  boardManagementService: BoardManagementService;
}

export function adminVenuesRoutes(deps: AdminVenuesRouteDeps) {
  return new Elysia({ name: "admin-venues-routes" }).get(
    "/api/admin/venues",
    async ({ request }) => {
      const session = await requireAdminSession(deps.authService, request.headers);
      const venues = await deps.boardManagementService.listVenues({
        memberships: session.memberships,
      });

      return apiSuccess({ venues });
    },
    {
      detail: {
        summary: "List accessible venues",
        description: "Returns venues the authenticated admin can access, filtered by RBAC role.",
        tags: ["Admin Venues"],
        security: [{ AdminSession: [] }],
      },
    },
  );
}
