import { Elysia, t } from "elysia";

import type {
  AdminManagementService,
  CreateAdminInput,
  PatchAdminInput,
} from "../admin/admin-management";
import type { AdminAuthService } from "../auth/admin-sessions";
import { requireAdminSession } from "../auth/admin-route-auth";
import { toAdminRbacContext, assertSuperAdmin } from "../auth/rbac";
import { forbiddenError, notFoundError, validationError } from "../http/errors";
import { apiSuccess } from "../http/response";
import { apiModels } from "../http/models";
import { API_TAGS } from "../http/openapi-config";
import { success, AdminUserSummary } from "../http/schemas";

export interface AdminUsersRouteDeps {
  authService: AdminAuthService;
  adminManagementService: AdminManagementService;
}

const adminUserErrors = {
  400: "ErrorResponse",
  401: "ErrorResponse",
  403: "ErrorResponse",
  404: "ErrorResponse",
} as const;

export function adminUsersRoutes(deps: AdminUsersRouteDeps) {
  return new Elysia({ name: "admin-users-routes" })
    .use(apiModels)
    .get(
      "/api/admin/admins",
      async ({ request }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const rbac = toAdminRbacContext(session);
        assertSuperAdmin(rbac);

        const admins = await deps.adminManagementService.listAdmins();
        return apiSuccess({ admins });
      },
      {
        response: {
          200: success(t.Object({ admins: t.Array(AdminUserSummary) })),
          401: "ErrorResponse",
          403: "ErrorResponse",
        },
        detail: {
          summary: "List admin users",
          description: "Returns all admin users. Requires super-admin.",
          tags: [API_TAGS.adminUsers],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .post(
      "/api/admin/admins",
      async ({ request, body }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const rbac = toAdminRbacContext(session);
        assertSuperAdmin(rbac);

        const email = body.email.trim().toLowerCase();
        if (email.length === 0) throw validationError("Email is required.");

        const displayName = body.displayName.trim();
        if (displayName.length === 0) throw validationError("Display name is required.");

        const input: CreateAdminInput = {
          email,
          displayName,
          password: body.password,
          status: "active",
        };

        const result = await deps.adminManagementService.createAdmin(input);

        if (result.status === "conflict") {
          throw validationError("An admin with this email already exists.");
        }

        return apiSuccess({ admin: result.admin });
      },
      {
        body: "CreateAdminBody",
        response: { 200: success(t.Object({ admin: AdminUserSummary })), ...adminUserErrors },
        detail: {
          summary: "Create admin user",
          description: "Creates a new admin user with a temporary password. Requires super-admin.",
          tags: [API_TAGS.adminUsers],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .patch(
      "/api/admin/admins/:adminUserId",
      async ({ request, params, body }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const rbac = toAdminRbacContext(session);
        assertSuperAdmin(rbac);

        if (Object.keys(body).length === 0) {
          throw validationError("At least one field must be provided.");
        }

        const patch: PatchAdminInput = {};

        if (body.displayName !== undefined) {
          const name = body.displayName.trim();
          if (name.length === 0) throw validationError("Display name is required.");
          patch.displayName = name;
        }

        if (body.status !== undefined) {
          patch.status = body.status;
        }

        const result = await deps.adminManagementService.updateAdmin(params.adminUserId, patch);

        if (result.status === "not_found") throw notFoundError();
        if (result.status === "forbidden") throw forbiddenError("Cannot disable a super-admin.");
        if (result.status === "last_super_admin") {
          throw validationError("Cannot disable the last active super-admin.");
        }

        return apiSuccess({ admin: result.admin });
      },
      {
        params: "AdminUserIdParams",
        body: "PatchAdminBody",
        response: { 200: success(t.Object({ admin: AdminUserSummary })), ...adminUserErrors },
        detail: {
          summary: "Update admin user",
          description: "Updates admin display name or status. Requires super-admin.",
          tags: [API_TAGS.adminUsers],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .post(
      "/api/admin/admins/:adminUserId/password-reset",
      async ({ request, params, body }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const rbac = toAdminRbacContext(session);
        assertSuperAdmin(rbac);

        const result = await deps.adminManagementService.resetPassword(
          params.adminUserId,
          body.password,
        );

        if (result.status === "not_found") throw notFoundError();

        return apiSuccess({ reset: true as const });
      },
      {
        params: "AdminUserIdParams",
        body: "AdminPasswordResetBody",
        response: {
          200: success(t.Object({ reset: t.Literal(true) })),
          ...adminUserErrors,
        },
        detail: {
          summary: "Reset admin password",
          description:
            "Resets an admin's password and revokes all their active sessions. Requires super-admin.",
          tags: [API_TAGS.adminUsers],
          security: [{ AdminSession: [] }],
        },
      },
    );
}
