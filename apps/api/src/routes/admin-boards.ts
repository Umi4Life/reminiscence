import { validateSlug } from "@queue-reminiscence/domain";
import { Elysia, t } from "elysia";

import type { CreateBoardInput, PatchBoardInput } from "../admin/board-input";
import type { BoardManagementService } from "../admin/board-management";
import type { BoardAccessService } from "../access/board-access";
import type { AdminAuthService } from "../auth/admin-sessions";
import { requireAdminSession } from "../auth/admin-route-auth";
import { toAdminRbacContext, type AdminRbacContext } from "../auth/rbac";
import { forbiddenError, notFoundError, validationError } from "../http/errors";
import { apiSuccess } from "../http/response";
import { apiModels } from "../http/models";
import { API_TAGS } from "../http/openapi-config";
import { BoardSummary, RotatedBoardAccessCredential, success } from "../http/schemas";

export interface AdminBoardsRouteDeps {
  authService: AdminAuthService;
  boardManagementService: BoardManagementService;
  boardAccessService: BoardAccessService;
}

const adminBoardErrors = {
  400: "ErrorResponse",
  401: "ErrorResponse",
  403: "ErrorResponse",
  404: "ErrorResponse",
} as const;

const boardOperationData = t.Object({ board: BoardSummary, changed: t.Boolean() });

function conflictMessage(field: "slug" | "publicSlug"): string {
  if (field === "slug") {
    return "A board with this slug already exists in the venue.";
  }

  return "A board with this public slug already exists.";
}

function requireValidSlug(value: string, label: string): string {
  const result = validateSlug(value.trim());
  if (!result.ok) throw validationError(result.message ?? `${label} is invalid.`);
  return result.value;
}

type BoardOperationHandler = (
  service: BoardManagementService,
  rbac: AdminRbacContext,
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
  const rbac = toAdminRbacContext(session);
  const result = await operation(deps.boardManagementService, rbac, session.admin.id, boardId);

  if (!result) {
    throw notFoundError();
  }

  return apiSuccess(result);
}

export function adminBoardsRoutes(deps: AdminBoardsRouteDeps) {
  return new Elysia({ name: "admin-boards-routes" })
    .use(apiModels)
    .get(
      "/api/admin/boards",
      async ({ request }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const boards = await deps.boardManagementService.listBoards(toAdminRbacContext(session));

        return apiSuccess({ boards });
      },
      {
        response: {
          200: success(t.Object({ boards: t.Array(BoardSummary) })),
          401: "ErrorResponse",
        },
        detail: {
          summary: "List boards",
          description: "Returns boards the authenticated admin can access, filtered by RBAC role.",
          tags: [API_TAGS.adminBoards],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .post(
      "/api/admin/boards",
      async ({ request, body }) => {
        const session = await requireAdminSession(deps.authService, request.headers);

        const trimmedName = body.name.trim();
        if (trimmedName.length === 0) throw validationError("Name is required.");

        const input: CreateBoardInput = {
          venueId: body.venueId,
          slug: requireValidSlug(body.slug, "Slug"),
          publicSlug: requireValidSlug(body.publicSlug, "Public slug"),
          name: trimmedName,
          description: body.description == null ? null : body.description.trim() || null,
          status: "open",
          publicViewPolicy: body.publicViewPolicy ?? "open",
          publicAddPolicy: body.publicAddPolicy ?? "access_code_required",
          publicRemovePolicy: body.publicRemovePolicy ?? "access_code_required",
          qrRotationPolicy: "manual",
          qrRotationIntervalMinutes: null,
        };

        const result = await deps.boardManagementService.createBoard(
          toAdminRbacContext(session),
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
        body: "CreateBoardBody",
        response: { 200: success(t.Object({ board: BoardSummary })), ...adminBoardErrors },
        detail: {
          summary: "Create board",
          description: "Creates a board in the closed state. Slugs must be unique within scope.",
          tags: [API_TAGS.adminBoards],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .get(
      "/api/admin/boards/:boardId",
      async ({ request, params }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const board = await deps.boardManagementService.getBoard(
          toAdminRbacContext(session),
          params.boardId,
        );

        if (!board) {
          throw notFoundError();
        }

        return apiSuccess({ board });
      },
      {
        params: "BoardIdParams",
        response: {
          200: success(t.Object({ board: BoardSummary })),
          401: "ErrorResponse",
          404: "ErrorResponse",
        },
        detail: {
          summary: "Get board",
          description: "Returns a single board by id.",
          tags: [API_TAGS.adminBoards],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .patch(
      "/api/admin/boards/:boardId",
      async ({ request, params, body }) => {
        const session = await requireAdminSession(deps.authService, request.headers);

        if (Object.keys(body).length === 0) {
          throw validationError("At least one board field must be provided.");
        }

        const patch: PatchBoardInput = {};

        if (body.slug !== undefined) {
          patch.slug = requireValidSlug(body.slug, "Slug");
        }

        if (body.publicSlug !== undefined) {
          patch.publicSlug = requireValidSlug(body.publicSlug, "Public slug");
        }

        if (body.name !== undefined) {
          const name = body.name.trim();
          if (name.length === 0) throw validationError("Name is required.");
          patch.name = name;
        }

        if ("description" in body) {
          patch.description = body.description == null ? null : body.description!.trim() || null;
        }

        if (body.publicViewPolicy !== undefined) {
          patch.publicViewPolicy = body.publicViewPolicy;
        }

        if (body.publicAddPolicy !== undefined) {
          patch.publicAddPolicy = body.publicAddPolicy;
        }

        if (body.publicRemovePolicy !== undefined) {
          patch.publicRemovePolicy = body.publicRemovePolicy;
        }

        const result = await deps.boardManagementService.updateBoard(
          toAdminRbacContext(session),
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
        params: "BoardIdParams",
        body: "PatchBoardBody",
        response: { 200: success(t.Object({ board: BoardSummary })), ...adminBoardErrors },
        detail: {
          summary: "Update board",
          description: "Patches one or more board fields. At least one field is required.",
          tags: [API_TAGS.adminBoards],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .delete(
      "/api/admin/boards/:boardId",
      async ({ request, params }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const result = await deps.boardManagementService.deleteBoard(
          toAdminRbacContext(session),
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
        params: "BoardIdParams",
        response: {
          200: success(t.Object({ deleted: t.Literal(true) })),
          401: "ErrorResponse",
          403: "ErrorResponse",
          404: "ErrorResponse",
        },
        detail: {
          summary: "Delete board",
          description: "Permanently deletes a board and its queue history.",
          tags: [API_TAGS.adminBoards],
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
        params: "BoardIdParams",
        response: { 200: success(boardOperationData), ...adminBoardErrors },
        detail: {
          summary: "Open board",
          description: "Opens the board for new participants. Idempotent.",
          tags: [API_TAGS.adminBoards],
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
        params: "BoardIdParams",
        response: { 200: success(boardOperationData), ...adminBoardErrors },
        detail: {
          summary: "Close board",
          description: "Closes the board to new participants. Idempotent.",
          tags: [API_TAGS.adminBoards],
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
        params: "BoardIdParams",
        response: { 200: success(boardOperationData), ...adminBoardErrors },
        detail: {
          summary: "Reset board",
          description: "Removes all active queue entries and records a reset event.",
          tags: [API_TAGS.adminBoards],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .post(
      "/api/admin/boards/:boardId/access-credentials/rotate",
      async ({ request, params }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const result = await deps.boardAccessService.rotateBoardAccessCredential(
          toAdminRbacContext(session),
          session.admin.id,
          params.boardId,
        );

        if (result.status === "not_found") {
          throw notFoundError();
        }

        return apiSuccess({ board: result.board, credential: result.credential });
      },
      {
        params: "BoardIdParams",
        response: {
          200: success(t.Object({ board: BoardSummary, credential: RotatedBoardAccessCredential })),
          401: "ErrorResponse",
          403: "ErrorResponse",
          404: "ErrorResponse",
        },
        detail: {
          summary: "Rotate board access credential",
          description:
            "Revokes the current access credential and issues a new one, returning the fresh access URL and QR token preview.",
          tags: [API_TAGS.adminBoards],
          security: [{ AdminSession: [] }],
        },
      },
    );
}
