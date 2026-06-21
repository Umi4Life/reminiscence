import { Elysia, t } from "elysia";

import type { AdminAuditAction, AdminAuditLogService } from "../admin/admin-audit-log";
import { sanitizeAuditMetadata } from "../admin/admin-audit-log";
import type { AdminAuthService } from "../auth/admin-sessions";
import { requireAdminSession } from "../auth/admin-route-auth";
import { toAdminRbacContext } from "../auth/rbac";
import { forbiddenError, validationError } from "../http/errors";
import { apiSuccess } from "../http/response";
import { apiModels } from "../http/models";
import { API_TAGS } from "../http/openapi-config";
import { success, AdminAuditEventItem } from "../http/schemas";

const DEFAULT_LIMIT = 20;

export interface AdminAuditLogRouteDeps {
  authService: AdminAuthService;
  auditLogService: AdminAuditLogService;
}

export function adminAuditLogRoutes(deps: AdminAuditLogRouteDeps) {
  return new Elysia({ name: "admin-audit-log-routes" }).use(apiModels).get(
    "/api/admin/audit-events",
    async ({ request, query }) => {
      const session = await requireAdminSession(deps.authService, request.headers);
      const rbac = toAdminRbacContext(session);

      const limit = query.limit ?? DEFAULT_LIMIT;

      let before: Date | undefined;
      if (query.before !== undefined) {
        const ts = Date.parse(query.before);
        if (isNaN(ts)) throw validationError("before must be a valid ISO 8601 datetime.");
        before = new Date(ts);
      }

      const result = await deps.auditLogService.listAuditEvents(rbac, {
        action: query.action as AdminAuditAction | undefined,
        organizationId: query.organizationId,
        before,
        limit,
      });

      if (result.status === "forbidden") throw forbiddenError();

      return apiSuccess({
        events: result.events.map((e) => ({
          ...e,
          metadata: sanitizeAuditMetadata(e.metadata),
        })),
      });
    },
    {
      query: "AuditEventsQuery",
      response: {
        200: success(t.Object({ events: t.Array(AdminAuditEventItem) })),
        400: "ErrorResponse",
        401: "ErrorResponse",
        403: "ErrorResponse",
      },
      detail: {
        summary: "List admin audit events",
        description:
          "Returns recent audit events. Super-admin sees all events. Org-owner sees events scoped to their organization.",
        tags: [API_TAGS.adminAuditLog],
        security: [{ AdminSession: [] }],
      },
    },
  );
}
