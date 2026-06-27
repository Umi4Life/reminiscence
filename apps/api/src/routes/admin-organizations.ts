import { validateSlug } from "@queue-reminiscence/domain";
import { Elysia, t } from "elysia";

import type { BoardManagementService } from "../admin/board-management";
import type { OrgManagementService } from "../admin/org-management";
import type { AdminAuditLogService } from "../admin/admin-audit-log";
import type { AdminAuthService } from "../auth/admin-sessions";
import { requireAdminSession } from "../auth/admin-route-auth";
import { toAdminRbacContext } from "../auth/rbac";
import { conflictError, forbiddenError, notFoundError, validationError } from "../http/errors";
import { parseOrgsRequest } from "../http/pagination";
import { apiSuccess } from "../http/response";
import { apiModels } from "../http/models";
import { API_TAGS } from "../http/openapi-config";
import { OrganizationSummary, success } from "../http/schemas";

export interface AdminOrganizationsRouteDeps {
  authService: AdminAuthService;
  boardManagementService: BoardManagementService;
  orgManagementService: OrgManagementService;
  auditLogService?: AdminAuditLogService;
}

const adminOrgErrors = {
  400: "ErrorResponse",
  401: "ErrorResponse",
  403: "ErrorResponse",
  404: "ErrorResponse",
} as const;

function requireValidOrgSlug(value: string): string {
  const result = validateSlug(value.trim());
  if (!result.ok) throw validationError(result.message ?? "Slug is invalid.");
  return result.value;
}

export function adminOrganizationsRoutes(deps: AdminOrganizationsRouteDeps) {
  return new Elysia({ name: "admin-organizations-routes" })
    .use(apiModels)
    .get(
      "/api/admin/organizations",
      async ({ request, query }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const orgsQuery = parseOrgsRequest(query);
        const result = await deps.boardManagementService.listOrganizations(
          toAdminRbacContext(session),
          orgsQuery,
        );

        return apiSuccess({
          organizations: result.items,
          nextCursor: result.nextCursor,
          loaded: result.items.length,
        });
      },
      {
        query: "OrgListQuery",
        response: {
          200: success(
            t.Object({
              organizations: t.Array(OrganizationSummary),
              nextCursor: t.Nullable(t.String()),
              loaded: t.Number(),
            }),
          ),
          401: "ErrorResponse",
        },
        detail: {
          summary: "List accessible organizations",
          description: "Returns all organizations the authenticated admin has any membership in.",
          tags: [API_TAGS.adminOrganizations],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .post(
      "/api/admin/organizations",
      async ({ request, body }) => {
        const session = await requireAdminSession(deps.authService, request.headers);

        const trimmedName = body.name.trim();
        if (trimmedName.length === 0) throw validationError("Name is required.");

        const result = await deps.orgManagementService.createOrganization(
          toAdminRbacContext(session),
          {
            slug: requireValidOrgSlug(body.slug),
            name: trimmedName,
          },
        );

        if (result.status === "forbidden") {
          throw forbiddenError();
        }

        if (result.status === "conflict") {
          throw conflictError("An organization with this slug already exists.");
        }

        await deps.auditLogService?.record({
          actorAdminUserId: session.admin.id,
          action: "org_create",
          targetId: result.organization.id,
        });

        return apiSuccess({ organization: result.organization });
      },
      {
        body: "CreateOrganizationBody",
        response: {
          200: success(t.Object({ organization: OrganizationSummary })),
          409: "ErrorResponse",
          ...adminOrgErrors,
        },
        detail: {
          summary: "Create organization",
          description: "Creates a new organization. Requires super-admin.",
          tags: [API_TAGS.adminOrganizations],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .patch(
      "/api/admin/organizations/:orgId",
      async ({ request, params, body }) => {
        const session = await requireAdminSession(deps.authService, request.headers);

        if (Object.keys(body).length === 0) {
          throw validationError("At least one organization field must be provided.");
        }

        const patch: { slug?: string; name?: string } = {};

        if (body.slug !== undefined) {
          patch.slug = requireValidOrgSlug(body.slug);
        }

        if (body.name !== undefined) {
          const name = body.name.trim();
          if (name.length === 0) throw validationError("Name is required.");
          patch.name = name;
        }

        const result = await deps.orgManagementService.updateOrganization(
          toAdminRbacContext(session),
          params.orgId,
          patch,
        );

        if (result.status === "not_found") {
          throw notFoundError();
        }

        if (result.status === "forbidden") {
          throw forbiddenError();
        }

        if (result.status === "conflict") {
          throw conflictError("An organization with this slug already exists.");
        }

        await deps.auditLogService?.record({
          actorAdminUserId: session.admin.id,
          action: "org_update",
          targetId: params.orgId,
          organizationId: params.orgId,
        });

        return apiSuccess({ organization: result.organization });
      },
      {
        params: "OrgIdParams",
        body: "PatchOrganizationBody",
        response: {
          200: success(t.Object({ organization: OrganizationSummary })),
          409: "ErrorResponse",
          ...adminOrgErrors,
        },
        detail: {
          summary: "Update organization",
          description: "Patches organization fields. Requires super-admin or org-owner.",
          tags: [API_TAGS.adminOrganizations],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .delete(
      "/api/admin/organizations/:orgId",
      async ({ request, params }) => {
        const session = await requireAdminSession(deps.authService, request.headers);

        const result = await deps.orgManagementService.deleteOrganization(
          toAdminRbacContext(session),
          params.orgId,
        );

        if (result.status === "not_found") {
          throw notFoundError();
        }

        if (result.status === "forbidden") {
          throw forbiddenError();
        }

        if (result.status === "not_empty") {
          throw validationError(
            "Cannot delete an organization that has venues. Remove all venues first.",
          );
        }

        await deps.auditLogService?.record({
          actorAdminUserId: session.admin.id,
          action: "org_delete",
          targetId: params.orgId,
          organizationId: params.orgId,
        });

        return apiSuccess({ deleted: true });
      },
      {
        params: "OrgIdParams",
        response: {
          200: success(t.Object({ deleted: t.Literal(true) })),
          401: "ErrorResponse",
          403: "ErrorResponse",
          404: "ErrorResponse",
        },
        detail: {
          summary: "Delete organization",
          description: "Permanently deletes an empty organization. Requires super-admin.",
          tags: [API_TAGS.adminOrganizations],
          security: [{ AdminSession: [] }],
        },
      },
    );
}
