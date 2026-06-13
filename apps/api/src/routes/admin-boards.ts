import { Elysia } from "elysia";

import type { BoardManagementService } from "../admin/board-management";
import type { AdminAuthService } from "../auth/admin-sessions";
import { requireAdminSession } from "../auth/admin-route-auth";
import { notFoundError } from "../http/errors";
import { apiSuccess } from "../http/response";

export interface AdminBoardsRouteDeps {
  authService: AdminAuthService;
  boardManagementService: BoardManagementService;
}

export function adminBoardsRoutes(deps: AdminBoardsRouteDeps) {
  return new Elysia({ name: "admin-boards-routes" })
    .get("/api/admin/boards", async ({ request }) => {
      const session = await requireAdminSession(deps.authService, request.headers);
      const boards = await deps.boardManagementService.listBoards({
        memberships: session.memberships,
      });

      return apiSuccess({ boards });
    })
    .get("/api/admin/boards/:boardId", async ({ request, params }) => {
      const session = await requireAdminSession(deps.authService, request.headers);
      const board = await deps.boardManagementService.getBoard(
        { memberships: session.memberships },
        params.boardId,
      );

      if (!board) {
        throw notFoundError();
      }

      return apiSuccess({ board });
    });
}
