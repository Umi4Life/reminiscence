import { validateSlug } from "@queue-reminiscence/domain";
import { Elysia, t } from "elysia";

import type { CreateBoardInput, PatchBoardInput } from "../admin/board-input";
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

const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";

const PUBLIC_VIEW_POLICY = t.Union([t.Literal("open"), t.Literal("access_code_required")]);

const PUBLIC_MUTATION_POLICY = t.Union([
  t.Literal("access_code_required"),
  t.Literal("staff_only"),
  t.Literal("disabled"),
]);

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
    .model({
      "board.createBody": t.Object({
        venueId: t.String({ pattern: UUID_PATTERN }),
        slug: t.String({ minLength: 1 }),
        publicSlug: t.String({ minLength: 1 }),
        name: t.String({ minLength: 1 }),
        description: t.Optional(t.Nullable(t.String())),
        status: t.Optional(t.Literal("closed")),
        publicViewPolicy: t.Optional(PUBLIC_VIEW_POLICY),
        publicAddPolicy: t.Optional(PUBLIC_MUTATION_POLICY),
        publicRemovePolicy: t.Optional(PUBLIC_MUTATION_POLICY),
        qrRotationPolicy: t.Optional(t.Literal("manual")),
        qrRotationIntervalMinutes: t.Optional(t.Null()),
      }),
      "board.patchBody": t.Object({
        slug: t.Optional(t.String({ minLength: 1 })),
        publicSlug: t.Optional(t.String({ minLength: 1 })),
        name: t.Optional(t.String({ minLength: 1 })),
        description: t.Optional(t.Nullable(t.String())),
        publicViewPolicy: t.Optional(PUBLIC_VIEW_POLICY),
        publicAddPolicy: t.Optional(PUBLIC_MUTATION_POLICY),
        publicRemovePolicy: t.Optional(PUBLIC_MUTATION_POLICY),
      }),
    })
    .get("/api/admin/boards", async ({ request }) => {
      const session = await requireAdminSession(deps.authService, request.headers);
      const boards = await deps.boardManagementService.listBoards({
        memberships: session.memberships,
      });

      return apiSuccess({ boards });
    })
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
          status: "closed",
          publicViewPolicy: body.publicViewPolicy ?? "open",
          publicAddPolicy: body.publicAddPolicy ?? "access_code_required",
          publicRemovePolicy: body.publicRemovePolicy ?? "access_code_required",
          qrRotationPolicy: "manual",
          qrRotationIntervalMinutes: null,
        };

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
      { body: "board.createBody" },
    )
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
    })
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
      { body: "board.patchBody" },
    )
    .delete("/api/admin/boards/:boardId", async ({ request, params }) => {
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
    })
    .post("/api/admin/boards/:boardId/open", async ({ request, params }) =>
      runBoardOperationRoute(deps, request, params.boardId, (service, rbac, adminUserId, boardId) =>
        service.openBoard(rbac, adminUserId, boardId),
      ),
    )
    .post("/api/admin/boards/:boardId/close", async ({ request, params }) =>
      runBoardOperationRoute(deps, request, params.boardId, (service, rbac, adminUserId, boardId) =>
        service.closeBoard(rbac, adminUserId, boardId),
      ),
    )
    .post("/api/admin/boards/:boardId/reset", async ({ request, params }) =>
      runBoardOperationRoute(deps, request, params.boardId, (service, rbac, adminUserId, boardId) =>
        service.resetBoard(rbac, adminUserId, boardId),
      ),
    )
    .post("/api/admin/boards/:boardId/access-credentials/rotate", async ({ request, params }) => {
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
    });
}
