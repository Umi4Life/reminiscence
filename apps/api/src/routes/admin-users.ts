import { Elysia, t } from "elysia";

import type {
  AdminManagementService,
  CreateAdminInput,
  PatchAdminInput,
} from "../admin/admin-management";
import type { AdminAuditLogService } from "../admin/admin-audit-log";
import type { AdminAuthService } from "../auth/admin-sessions";
import { requireAdminSession } from "../auth/admin-route-auth";
import { toAdminRbacContext, assertSuperAdmin, canCreateAdminWithMembership } from "../auth/rbac";
import { forbiddenError, notFoundError, validationError } from "../http/errors";
import { parsePageRequest } from "../http/pagination";
import { apiSuccess } from "../http/response";
import { apiModels } from "../http/models";
import { API_TAGS } from "../http/openapi-config";
import { success, AdminUserSummary } from "../http/schemas";

export interface AdminUsersRouteDeps {
  authService: AdminAuthService;
  adminManagementService: AdminManagementService;
  auditLogService?: AdminAuditLogService;
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
      async ({ request, query }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const rbac = toAdminRbacContext(session);
        const page = parsePageRequest(query);

        const result = await deps.adminManagementService.listAdmins(rbac, page);
        if (result.status === "forbidden") throw forbiddenError();

        return apiSuccess({ admins: result.page.items, nextCursor: result.page.nextCursor });
      },
      {
        query: "PaginationQuery",
        response: {
          200: success(
            t.Object({ admins: t.Array(AdminUserSummary), nextCursor: t.Nullable(t.String()) }),
          ),
          401: "ErrorResponse",
          403: "ErrorResponse",
        },
        detail: {
          summary: "List admin users",
          description:
            "Super-admin returns all admin users. Org-owner returns admins within their own org.",
          tags: [API_TAGS.adminUsers],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .get(
      "/api/admin/admins/:adminUserId",
      async ({ request, params }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const rbac = toAdminRbacContext(session);
        assertSuperAdmin(rbac);

        const admin = await deps.adminManagementService.getAdmin(params.adminUserId);
        if (!admin) throw notFoundError();

        return apiSuccess({ admin });
      },
      {
        params: "AdminUserIdParams",
        response: { 200: success(t.Object({ admin: AdminUserSummary })), ...adminUserErrors },
        detail: {
          summary: "Get admin user",
          description: "Returns a single admin user by ID. Requires super-admin.",
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

        const email = body.email.trim().toLowerCase();
        if (email.length === 0) throw validationError("Email is required.");

        const displayName = body.displayName.trim();
        if (displayName.length === 0) throw validationError("Display name is required.");

        let membership: CreateAdminInput["membership"];
        if (body.membership) {
          const { organizationId, venueId, role } = body.membership;

          // org_owner is org-level; venue roles must name a venue.
          if (role === "org_owner" && venueId !== null) {
            throw validationError("org_owner is an org-level role; venueId must be null.");
          }
          if ((role === "venue_manager" || role === "venue_staff") && venueId === null) {
            throw validationError(`${role} requires a venueId.`);
          }

          // Chain of command: the caller may only grant a role within their scope.
          if (!canCreateAdminWithMembership(rbac, { organizationId, venueId, role })) {
            throw forbiddenError("You cannot create an admin with that role or scope.");
          }

          membership = { organizationId, venueId, role };
        } else {
          // A bare admin (no membership) is a platform-level user — super-admin only.
          assertSuperAdmin(rbac);
        }

        const result = await deps.adminManagementService.createAdmin({
          email,
          displayName,
          password: body.password,
          status: "active",
          membership,
        });

        if (result.status === "conflict") {
          throw validationError("An admin with this email already exists.");
        }
        if (result.status === "org_not_found") {
          throw notFoundError("Organization not found.");
        }
        if (result.status === "venue_not_found") {
          throw notFoundError("Venue not found or does not belong to the organization.");
        }

        await deps.auditLogService?.record({
          actorAdminUserId: session.admin.id,
          action: "admin_create",
          targetId: result.admin.id,
          metadata: membership ? { role: membership.role } : null,
        });

        return apiSuccess({ admin: result.admin });
      },
      {
        body: "CreateAdminBody",
        response: { 200: success(t.Object({ admin: AdminUserSummary })), ...adminUserErrors },
        detail: {
          summary: "Create admin user",
          description:
            "Creates a new admin user with a temporary password. Super-admin may create a bare " +
            "admin (no membership). With an initial membership, the chain of command applies: " +
            "org_owner can grant any role in their org; venue_manager can grant manager/staff in " +
            "their own venue; venue_staff cannot create admins.",
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

        const result = await deps.adminManagementService.updateAdmin(
          rbac,
          params.adminUserId,
          patch,
          session.admin.id,
        );

        if (result.status === "not_found") throw notFoundError();
        if (result.status === "forbidden") throw forbiddenError("Cannot modify this admin.");
        if (result.status === "last_super_admin") {
          throw validationError("Cannot disable the last active super-admin.");
        }
        if (result.status === "self_disable") {
          throw validationError("You cannot disable your own account.");
        }

        await deps.auditLogService?.record({
          actorAdminUserId: session.admin.id,
          action: "admin_update",
          targetId: params.adminUserId,
          metadata: patch.status !== undefined ? { status: patch.status } : null,
        });

        return apiSuccess({ admin: result.admin });
      },
      {
        params: "AdminUserIdParams",
        body: "PatchAdminBody",
        response: { 200: success(t.Object({ admin: AdminUserSummary })), ...adminUserErrors },
        detail: {
          summary: "Update admin user",
          description:
            "Updates admin display name or status. Super-admin can update any non-super-admin; " +
            "org-owner can update non-super-admin users within their own org.",
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

        const result = await deps.adminManagementService.resetPassword(
          rbac,
          params.adminUserId,
          body.password,
        );

        if (result.status === "not_found") throw notFoundError();
        if (result.status === "forbidden")
          throw forbiddenError("Cannot reset this admin's password.");

        await deps.auditLogService?.record({
          actorAdminUserId: session.admin.id,
          action: "admin_password_reset",
          targetId: params.adminUserId,
        });

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
            "Resets an admin's password and revokes all their active sessions. " +
            "Super-admin can reset any admin; org-owner can reset non-super-admin users within their own org.",
          tags: [API_TAGS.adminUsers],
          security: [{ AdminSession: [] }],
        },
      },
    );
}
