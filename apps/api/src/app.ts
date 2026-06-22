import type { AppConfig } from "@queue-reminiscence/config";
import { parseEnv } from "@queue-reminiscence/config/env";
import type { Database } from "@queue-reminiscence/db";
import { createDb } from "@queue-reminiscence/db";
import { openapi } from "@elysia/openapi";
import { Elysia, ValidationError } from "elysia";

import {
  createDbBoardManagementService,
  type BoardManagementService,
} from "./admin/board-management";
import { createDbOrgManagementService, type OrgManagementService } from "./admin/org-management";
import {
  createDbVenueManagementService,
  type VenueManagementService,
} from "./admin/venue-management";
import {
  createDbMembershipManagementService,
  type MembershipManagementService,
} from "./admin/membership-management";
import {
  createDbAdminManagementService,
  type AdminManagementService,
} from "./admin/admin-management";
import {
  createDbAdminAuditLogService,
  createNoopAdminAuditLogService,
  type AdminAuditLogService,
} from "./admin/admin-audit-log";
import { createDbBoardAccessService, type BoardAccessService } from "./access/board-access";
import { createDbAdminAuthService, type AdminAuthService } from "./auth/admin-sessions";
import { createDbPublicSessionService, type PublicSessionService } from "./auth/public-sessions";
import { buildAllowedOrigins, resolveCors } from "./http/cors";
import {
  adminOriginOf,
  isForbiddenAdminCrossOrigin,
  isForbiddenPublicCrossOrigin,
  publicOriginOf,
} from "./http/csrf";
import { ApiError, forbiddenError, validationError } from "./http/errors";
import { apiFailure } from "./http/response";
import { createDbPublicBoardReadService, type PublicBoardReadService } from "./queue/read";
import { createDbRateLimiter, type RateLimiter } from "./rate-limit/rate-limiter";
import { createDbQueueMutationService, type QueueMutationService } from "./queue/mutations";
import { adminAuthRoutes } from "./routes/admin-auth";
import { adminBoardsRoutes } from "./routes/admin-boards";
import { adminOrganizationsRoutes } from "./routes/admin-organizations";
import { adminVenuesRoutes } from "./routes/admin-venues";
import { adminMembershipsRoutes } from "./routes/admin-memberships";
import { adminUsersRoutes } from "./routes/admin-users";
import { adminAuditLogRoutes } from "./routes/admin-audit-log";
import { publicAccessRoutes } from "./routes/public-access";
import { publicBoardsRoutes } from "./routes/public-boards";
import { qrRoutes } from "./routes/qr";
import { healthRoutes, isDatabaseReachable } from "./routes/health";
import { displayRoutes } from "./routes/display";
import { openApiDocumentation } from "./http/openapi-config";
import type { DisplayDeviceResolver } from "./display/display-devices";
import type { DisplayStateService } from "./display/display-state";

export interface AppDeps {
  config?: AppConfig;
  db?: Database;
  checkDatabase?: () => Promise<boolean>;
  adminAuthService?: AdminAuthService;
  boardManagementService?: BoardManagementService;
  orgManagementService?: OrgManagementService;
  venueManagementService?: VenueManagementService;
  membershipManagementService?: MembershipManagementService;
  adminManagementService?: AdminManagementService;
  boardAccessService?: BoardAccessService;
  publicSessionService?: PublicSessionService;
  publicBoardReadService?: PublicBoardReadService;
  queueMutationService?: QueueMutationService;
  rateLimiter?: RateLimiter;
  auditLogService?: AdminAuditLogService;
  displayDeviceResolver?: DisplayDeviceResolver;
  displayStateService?: DisplayStateService;
}


function loadAppConfig(): AppConfig {
  const runtimeGlobal = globalThis as typeof globalThis & {
    Bun?: { env: Record<string, string | undefined> };
    process?: { env: Record<string, string | undefined> };
  };

  const env = runtimeGlobal.Bun?.env ?? runtimeGlobal.process?.env ?? {};
  return parseEnv(env);
}

export function createApp(deps: AppDeps = {}) {
  const config = deps.config ?? loadAppConfig();
  const db = deps.db ?? createDb(config.databaseUrl);
  const checkDatabase =
    deps.checkDatabase ??
    (async () => {
      return isDatabaseReachable(db);
    });
  const adminAuthService = deps.adminAuthService ?? createDbAdminAuthService(db, config);
  const boardManagementService = deps.boardManagementService ?? createDbBoardManagementService(db);
  const orgManagementService = deps.orgManagementService ?? createDbOrgManagementService(db);
  const venueManagementService = deps.venueManagementService ?? createDbVenueManagementService(db);
  const membershipManagementService =
    deps.membershipManagementService ?? createDbMembershipManagementService(db);
  const adminManagementService = deps.adminManagementService ?? createDbAdminManagementService(db);
  const boardAccessService = deps.boardAccessService ?? createDbBoardAccessService(db, config);
  const publicSessionService =
    deps.publicSessionService ?? createDbPublicSessionService(db, config);
  const publicBoardReadService =
    deps.publicBoardReadService ?? createDbPublicBoardReadService(db, config, publicSessionService);
  const rateLimiter = deps.rateLimiter ?? createDbRateLimiter(db);
  const auditLogService =
    deps.auditLogService ??
    (deps.db !== undefined ? createDbAdminAuditLogService(db) : createNoopAdminAuditLogService());
  const queueMutationService =
    deps.queueMutationService ??
    createDbQueueMutationService(db, config, publicSessionService, rateLimiter);

  const adminRouteDeps = {
    authService: adminAuthService,
    boardManagementService,
    orgManagementService,
    venueManagementService,
    boardAccessService,
    adminManagementService,
    auditLogService,
  };

  const allowedOrigins = buildAllowedOrigins(config);
  const adminOrigin = adminOriginOf(config);
  const publicOrigin = publicOriginOf(config);

  // Emit HSTS only when the deployment actually terminates TLS, mirroring the
  // `Secure`-cookie convention used elsewhere. Harmless to omit over plain HTTP
  // (dev), and avoids poisoning a browser's HSTS cache for a non-HTTPS host.
  const enableHsts =
    config.apiPublicBaseUrl.startsWith("https://") || config.apiAdminBaseUrl.startsWith("https://");

  const securityHeaders: Record<string, string> = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "geolocation=(), microphone=(), camera=()",
    ...(enableHsts ? { "strict-transport-security": "max-age=31536000; includeSubDomains" } : {}),
  };

  // Cap request bodies well above the largest legitimate JSON payload here
  // (claims, logins, display names) so an oversized POST can't exhaust memory.
  const app = new Elysia({
    name: "queue-reminiscence-api",
    serve: { maxRequestBodySize: 64 * 1024 },
  })
    .use(openapi({ path: "/api/docs", documentation: openApiDocumentation }))
    .onRequest(({ request, set }) => {
      const { headers, preflight } = resolveCors(allowedOrigins, request);
      Object.assign(set.headers, headers, securityHeaders);

      if (preflight) {
        set.status = 204;
        return "";
      }

      // CSRF defense-in-depth: reject mutations from a foreign origin. Admin and
      // public sessions are both cookie-based (`SameSite=Lax`), so both surfaces
      // get the second layer.
      if (isForbiddenAdminCrossOrigin(request, adminOrigin)) {
        set.status = 403;
        return apiFailure(forbiddenError("Cross-origin request rejected."));
      }

      if (isForbiddenPublicCrossOrigin(request, publicOrigin)) {
        set.status = 403;
        return apiFailure(forbiddenError("Cross-origin request rejected."));
      }
    })
    .get("/", () => {
      return new Response(
        `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reminiscence</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 1rem; color: #222; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; }
    p { color: #555; line-height: 1.5; }
    a { color: #0070f3; }
  </style>
</head>
<body>
  <h1>Reminiscence</h1>
</body>
</html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    })
    .onError(({ error, code, set }) => {
      if (code === "NOT_FOUND") {
        set.status = 404;
        return { ok: false, error: { code: "not_found", message: "Not found." } };
      }

      if (error instanceof ValidationError) {
        set.status = 400;
        let message = "Request validation failed.";
        try {
          const parsed: unknown = JSON.parse(error.message);
          if (parsed && typeof parsed === "object" && "summary" in parsed) {
            message = String((parsed as Record<string, unknown>).summary);
          }
        } catch {
          // keep generic fallback
        }
        return apiFailure(validationError(message));
      }

      if (error instanceof ApiError) {
        set.status = error.status;
        return apiFailure(error);
      }

      // Architecture §17 wants structured logs; at minimum, never let a non-API
      // failure vanish silently. The response still hides internals.
      console.error("Unhandled API error", error);

      set.status = 500;
      return {
        ok: false,
        error: {
          code: "internal_error",
          message: "Internal server error.",
        },
      };
    })
    .use(healthRoutes({ checkDatabase }))
    .use(adminAuthRoutes({ authService: adminAuthService, config, rateLimiter }))
    .use(adminOrganizationsRoutes(adminRouteDeps))
    .use(adminVenuesRoutes(adminRouteDeps))
    .use(adminBoardsRoutes(adminRouteDeps))
    .use(
      adminMembershipsRoutes({
        authService: adminAuthService,
        membershipManagementService,
        auditLogService,
      }),
    )
    .use(adminUsersRoutes(adminRouteDeps))
    .use(adminAuditLogRoutes({ authService: adminAuthService, auditLogService }))
    .use(publicAccessRoutes({ config, publicSessionService, rateLimiter }))
    .use(publicBoardsRoutes({ config, publicBoardReadService, queueMutationService, rateLimiter }))
    .use(
      displayRoutes({
        config,
        db,
        displayDeviceResolver: deps.displayDeviceResolver,
        displayStateService: deps.displayStateService,
      }),
    )
    .use(qrRoutes({ config, db, rateLimiter }));

  return app;
}

export function createTestApp(deps: AppDeps = {}) {
  return createApp(deps);
}
