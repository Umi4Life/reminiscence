import { Elysia, t } from "elysia";

import type {
  AssignMembershipInput,
  MembershipManagementService,
} from "../admin/membership-management";
import type { AdminAuditLogService } from "../admin/admin-audit-log";
import type { AdminAuthService } from "../auth/admin-sessions";
import { requireAdminSession } from "../auth/admin-route-auth";
import { toAdminRbacContext } from "../auth/rbac";
import { conflictError, forbiddenError, notFoundError, validationError } from "../http/errors";
import { apiSuccess } from "../http/response";
import { apiModels } from "../http/models";
import { API_TAGS } from "../http/openapi-config";
import { MembershipDetail, success } from "../http/schemas";

export interface AdminMembershipsRouteDeps {
  authService: AdminAuthService;
  membershipManagementService: MembershipManagementService;
  auditLogService?: AdminAuditLogService;
}

const membershipErrors = {
  400: "ErrorResponse",
  401: "ErrorResponse",
  403: "ErrorResponse",
  404: "ErrorResponse",
  409: "ErrorResponse",
} as const;

export function adminMembershipsRoutes(deps: AdminMembershipsRouteDeps) {
  return (
    new Elysia({ name: "admin-memberships-routes" })
      .use(apiModels)

      // POST /api/admin/memberships — assign org-level or venue-level membership
      .post(
        "/api/admin/memberships",
        async ({ request, body }) => {
          const session = await requireAdminSession(deps.authService, request.headers);

          // org_owner role must be org-level (venueId = null)
          if (body.role === "org_owner" && body.venueId !== null) {
            throw validationError("org_owner is an org-level role; venueId must be null.");
          }
          // venue-level roles must have venueId
          if (
            (body.role === "venue_manager" || body.role === "venue_staff") &&
            body.venueId === null
          ) {
            throw validationError(`${body.role} requires a venueId.`);
          }

          const input: AssignMembershipInput = {
            adminUserId: body.adminUserId,
            organizationId: body.organizationId,
            venueId: body.venueId,
            role: body.role,
          };

          const result = await deps.membershipManagementService.assignMembership(
            toAdminRbacContext(session),
            input,
          );

          if (result.status === "forbidden") throw forbiddenError();
          if (result.status === "org_not_found") throw notFoundError("Organization not found.");
          if (result.status === "venue_not_found")
            throw notFoundError("Venue not found or does not belong to the organization.");
          if (result.status === "user_not_found") throw notFoundError("Admin user not found.");
          if (result.status === "conflict")
            throw conflictError("This admin already has a membership in the given scope.");

          await deps.auditLogService?.record({
            actorAdminUserId: session.admin.id,
            action: "membership_assign",
            targetId: result.membership.id,
            organizationId: result.membership.organizationId,
            metadata: { adminUserId: input.adminUserId, role: input.role },
          });

          return apiSuccess({ membership: result.membership });
        },
        {
          body: "AssignMembershipBody",
          response: {
            200: success(t.Object({ membership: MembershipDetail })),
            ...membershipErrors,
          },
          detail: {
            summary: "Assign membership",
            description:
              "Assigns an org-level or venue-level membership to an admin user. " +
              "Super-admin can assign in any org; org-owner can assign within their own org only. " +
              "Org-owners cannot assign memberships to super-admin users or grant platform-level access.",
            tags: [API_TAGS.adminMemberships],
            security: [{ AdminSession: [] }],
          },
        },
      )

      // DELETE /api/admin/memberships/:id — revoke membership
      .delete(
        "/api/admin/memberships/:id",
        async ({ request, params }) => {
          const session = await requireAdminSession(deps.authService, request.headers);

          const result = await deps.membershipManagementService.revokeMembership(
            toAdminRbacContext(session),
            params.id,
            session.admin.id,
          );

          if (result.status === "not_found") throw notFoundError();
          if (result.status === "forbidden") throw forbiddenError();
          if (result.status === "last_owner") {
            throw conflictError(
              "Cannot remove the last org_owner of an organization. Assign another owner first.",
            );
          }
          if (result.status === "self_revoke") {
            throw validationError("You cannot revoke your own membership.");
          }

          await deps.auditLogService?.record({
            actorAdminUserId: session.admin.id,
            action: "membership_revoke",
            targetId: params.id,
          });

          return apiSuccess({ revoked: true });
        },
        {
          params: "MembershipIdParams",
          response: {
            200: success(t.Object({ revoked: t.Literal(true) })),
            ...membershipErrors,
          },
          detail: {
            summary: "Revoke membership",
            description:
              "Revokes a membership by id. Super-admin can revoke any membership; " +
              "org-owner can only revoke memberships within their own organization. " +
              "The last org_owner of an organization cannot be removed.",
            tags: [API_TAGS.adminMemberships],
            security: [{ AdminSession: [] }],
          },
        },
      )
  );
}
