import { Elysia } from "elysia";

import { parseCreateBoardBody, parsePatchBoardBody } from "../admin/board-input";
import { BoardIdParams, CreateBoardBody, PatchBoardBody } from "../http/schemas";
import type { BoardManagementService } from "../admin/board-management";
import type { BoardAccessService } from "../access/board-access";
import type { AdminAuthService } from "../auth/admin-sessions";
import { requireAdminSession } from "../auth/admin-route-auth";
import { forbiddenError, notFoundError, validationError } from "../http/errors";
import { apiSuccess } from "../http/response";

export interface AdminBoardsRouteDeps {
  authService: AdminAuthService;
  boardManagementService: BoardManagementService;
  boardAccessService: BoardAccessService;
}

function conflictMessage(field: "slug" | "publicSlug"): string {
  if (field === "slug") {
    return "A board with this slug already exists in the venue.";
  }

  return "A board with this public slug already exists.";
}

type BoardOperationHandler = (
  service: BoardManagementService,
  rbac: { memberships: Awaited<ReturnType<AdminAuthService["resolve"]>>["memberships"] },
  adminUserId: string,
  boardId: string,
) => ReturnType<BoardManagementService["openBoard"]>;

async function runBoardOperationRoute(
  deps: AdminBoardsRouteDeps,
  request: Request,
  boardId: string,
  operation: BoardOperationHandler,
) {
  const session = await requireAdminSession(deps.authService, request.headers);
  const rbac = { memberships: session.memberships };
  const result = await operation(deps.boardManagementService, rbac, session.admin.id, boardId);

  if (!result) {
    throw notFoundError();
  }

  return apiSuccess(result);
}

export function adminBoardsRoutes(deps: AdminBoardsRouteDeps) {
  return new Elysia({ name: "admin-boards-routes" })
    .get(
      "/api/admin/boards",
      async ({ request }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const boards = await deps.boardManagementService.listBoards({
          memberships: session.memberships,
        });

        return apiSuccess({ boards });
      },
      {
        detail: {
          summary: "List accessible boards",
          tags: ["Admin Boards"],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .post(
      "/api/admin/boards",
      async ({ request, body }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const input = parseCreateBoardBody(body);
        const result = await deps.boardManagementService.createBoard(
          { memberships: session.memberships },
          input,
        );

        if (result.status === "venue_not_found") {
          throw notFoundError();
        }

        if (result.status === "forbidden") {
          throw forbiddenError();
        }

        if (result.status === "conflict") {
          throw validationError(conflictMessage(result.field));
        }

        return apiSuccess({ board: result.board });
      },
      {
        body: CreateBoardBody,
        detail: {
          summary: "Create board",
          description: "Always created with status: closed and qrRotationPolicy: manual.",
          tags: ["Admin Boards"],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .get(
      "/api/admin/boards/:boardId",
      async ({ request, params }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const board = await deps.boardManagementService.getBoard(
          { memberships: session.memberships },
          params.boardId,
        );

        if (!board) {
          throw notFoundError();
        }

        return apiSuccess({ board });
      },
      {
        params: BoardIdParams,
        detail: {
          summary: "Get board",
          tags: ["Admin Boards"],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .patch(
      "/api/admin/boards/:boardId",
      async ({ request, params, body }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const patch = parsePatchBoardBody(body);
        const result = await deps.boardManagementService.updateBoard(
          { memberships: session.memberships },
          params.boardId,
          patch,
        );

        if (result.status === "not_found") {
          throw notFoundError();
        }

        if (result.status === "forbidden") {
          throw forbiddenError();
        }

        if (result.status === "conflict") {
          throw validationError(conflictMessage(result.field));
        }

        return apiSuccess({ board: result.board });
      },
      {
        params: BoardIdParams,
        body: PatchBoardBody,
        detail: {
          summary: "Update board",
          tags: ["Admin Boards"],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .delete(
      "/api/admin/boards/:boardId",
      async ({ request, params }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const result = await deps.boardManagementService.deleteBoard(
          { memberships: session.memberships },
          params.boardId,
        );

        if (result.status === "not_found") {
          throw notFoundError();
        }

        if (result.status === "forbidden") {
          throw forbiddenError();
        }

        return apiSuccess({ deleted: true });
      },
      {
        params: BoardIdParams,
        detail: {
          summary: "Delete board",
          description: "Permanently deletes the board and all associated data. Irreversible.",
          tags: ["Admin Boards"],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .post(
      "/api/admin/boards/:boardId/open",
      async ({ request, params }) =>
        runBoardOperationRoute(
          deps,
          request,
          params.boardId,
          (service, rbac, adminUserId, boardId) => service.openBoard(rbac, adminUserId, boardId),
        ),
      {
        params: BoardIdParams,
        detail: {
          summary: "Open board",
          description: "Transitions to status: open. Idempotent.",
          tags: ["Admin Boards"],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .post(
      "/api/admin/boards/:boardId/close",
      async ({ request, params }) =>
        runBoardOperationRoute(
          deps,
          request,
          params.boardId,
          (service, rbac, adminUserId, boardId) => service.closeBoard(rbac, adminUserId, boardId),
        ),
      {
        params: BoardIdParams,
        detail: {
          summary: "Close board",
          description: "Transitions to status: closed. Idempotent.",
          tags: ["Admin Boards"],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .post(
      "/api/admin/boards/:boardId/reset",
      async ({ request, params }) =>
        runBoardOperationRoute(
          deps,
          request,
          params.boardId,
          (service, rbac, adminUserId, boardId) => service.resetBoard(rbac, adminUserId, boardId),
        ),
      {
        params: BoardIdParams,
        detail: {
          summary: "Reset board queue",
          description: "Soft-removes all active queue entries.",
          tags: ["Admin Boards"],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .post(
      "/api/admin/boards/:boardId/access-credentials/rotate",
      async ({ request, params }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const result = await deps.boardAccessService.rotateBoardAccessCredential(
          { memberships: session.memberships },
          session.admin.id,
          params.boardId,
        );

        if (result.status === "not_found") {
          throw notFoundError();
        }

        return apiSuccess({ board: result.board, credential: result.credential });
      },
      {
        params: BoardIdParams,
        detail: {
          summary: "Rotate QR access credential",
          description:
            "Generates a new credential, immediately revoking all previous ones and invalidating active public sessions.",
          tags: ["Admin Boards"],
          security: [{ AdminSession: [] }],
        },
      },
    );
}
