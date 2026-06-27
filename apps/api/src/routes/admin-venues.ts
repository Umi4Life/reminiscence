import { validateSlug, validateTimezone } from "@queue-reminiscence/domain";
import { Elysia, t } from "elysia";

import type {
  CreateVenueInput,
  PatchVenueInput,
  VenueManagementService,
} from "../admin/venue-management";
import type { AdminAuthService } from "../auth/admin-sessions";
import { requireAdminSession } from "../auth/admin-route-auth";
import { toAdminRbacContext } from "../auth/rbac";
import { forbiddenError, notFoundError, validationError } from "../http/errors";
import { parsePageRequest } from "../http/pagination";
import { apiSuccess } from "../http/response";
import { apiModels } from "../http/models";
import { API_TAGS } from "../http/openapi-config";
import { success, VenueSummary } from "../http/schemas";

export interface AdminVenuesRouteDeps {
  authService: AdminAuthService;
  venueManagementService: VenueManagementService;
}

const adminVenueErrors = {
  400: "ErrorResponse",
  401: "ErrorResponse",
  403: "ErrorResponse",
  404: "ErrorResponse",
} as const;

function requireValidSlug(value: string, label: string): string {
  const result = validateSlug(value.trim());
  if (!result.ok) throw validationError(result.message ?? `${label} is invalid.`);
  return result.value;
}

function requireValidTimezone(value: string): string {
  const result = validateTimezone(value.trim());
  if (!result.ok) throw validationError(result.message ?? "Timezone is invalid.");
  return result.value;
}

export function adminVenuesRoutes(deps: AdminVenuesRouteDeps) {
  return new Elysia({ name: "admin-venues-routes" })
    .use(apiModels)
    .get(
      "/api/admin/venues",
      async ({ request, query }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const page = parsePageRequest(query);
        const result = await deps.venueManagementService.listVenues(
          toAdminRbacContext(session),
          page,
        );

        return apiSuccess({ venues: result.items, nextCursor: result.nextCursor });
      },
      {
        query: "PaginationQuery",
        response: {
          200: success(
            t.Object({ venues: t.Array(VenueSummary), nextCursor: t.Nullable(t.String()) }),
          ),
          401: "ErrorResponse",
        },
        detail: {
          summary: "List accessible venues",
          description: "Returns venues the authenticated admin can access, filtered by RBAC role.",
          tags: [API_TAGS.adminVenues],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .post(
      "/api/admin/venues",
      async ({ request, body }) => {
        const session = await requireAdminSession(deps.authService, request.headers);

        const trimmedName = body.name.trim();
        if (trimmedName.length === 0) throw validationError("Name is required.");

        const input: CreateVenueInput = {
          organizationId: body.organizationId,
          slug: requireValidSlug(body.slug, "Slug"),
          name: trimmedName,
          timezone: requireValidTimezone(body.timezone),
          address: body.address == null ? null : body.address.trim() || null,
        };

        const result = await deps.venueManagementService.createVenue(
          toAdminRbacContext(session),
          input,
        );

        if (result.status === "org_not_found") throw notFoundError();
        if (result.status === "forbidden") throw forbiddenError();
        if (result.status === "conflict") {
          throw validationError("A venue with this slug already exists in the organisation.");
        }

        return apiSuccess({ venue: result.venue });
      },
      {
        body: "CreateVenueBody",
        response: { 200: success(t.Object({ venue: VenueSummary })), ...adminVenueErrors },
        detail: {
          summary: "Create venue",
          description: "Creates a venue. Requires org-owner or super-admin.",
          tags: [API_TAGS.adminVenues],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .get(
      "/api/admin/venues/:venueId",
      async ({ request, params }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const venue = await deps.venueManagementService.getVenue(
          toAdminRbacContext(session),
          params.venueId,
        );

        if (!venue) throw notFoundError();

        return apiSuccess({ venue });
      },
      {
        params: "VenueIdParams",
        response: {
          200: success(t.Object({ venue: VenueSummary })),
          401: "ErrorResponse",
          404: "ErrorResponse",
        },
        detail: {
          summary: "Get venue",
          description: "Returns a single venue by id.",
          tags: [API_TAGS.adminVenues],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .patch(
      "/api/admin/venues/:venueId",
      async ({ request, params, body }) => {
        const session = await requireAdminSession(deps.authService, request.headers);

        if (Object.keys(body).length === 0) {
          throw validationError("At least one venue field must be provided.");
        }

        const patch: PatchVenueInput = {};

        if (body.slug !== undefined) {
          patch.slug = requireValidSlug(body.slug, "Slug");
        }

        if (body.name !== undefined) {
          const name = body.name.trim();
          if (name.length === 0) throw validationError("Name is required.");
          patch.name = name;
        }

        if (body.timezone !== undefined) {
          patch.timezone = requireValidTimezone(body.timezone);
        }

        if ("address" in body) {
          patch.address = body.address == null ? null : body.address!.trim() || null;
        }

        const result = await deps.venueManagementService.updateVenue(
          toAdminRbacContext(session),
          params.venueId,
          patch,
        );

        if (result.status === "not_found") throw notFoundError();
        if (result.status === "forbidden") throw forbiddenError();
        if (result.status === "conflict") {
          throw validationError("A venue with this slug already exists in the organisation.");
        }

        return apiSuccess({ venue: result.venue });
      },
      {
        params: "VenueIdParams",
        body: "PatchVenueBody",
        response: { 200: success(t.Object({ venue: VenueSummary })), ...adminVenueErrors },
        detail: {
          summary: "Update venue",
          description: "Patches one or more venue fields. Requires org-owner or super-admin.",
          tags: [API_TAGS.adminVenues],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .delete(
      "/api/admin/venues/:venueId",
      async ({ request, params }) => {
        const session = await requireAdminSession(deps.authService, request.headers);
        const result = await deps.venueManagementService.deleteVenue(
          toAdminRbacContext(session),
          params.venueId,
        );

        if (result.status === "not_found") throw notFoundError();
        if (result.status === "forbidden") throw forbiddenError();
        if (result.status === "has_boards") {
          throw validationError("Cannot delete a venue that has boards. Delete all boards first.");
        }

        return apiSuccess({ deleted: true });
      },
      {
        params: "VenueIdParams",
        response: {
          200: success(t.Object({ deleted: t.Literal(true) })),
          ...adminVenueErrors,
        },
        detail: {
          summary: "Delete venue",
          description:
            "Permanently deletes a venue. Fails if boards exist. Requires org-owner or super-admin.",
          tags: [API_TAGS.adminVenues],
          security: [{ AdminSession: [] }],
        },
      },
    );
}
