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
  boardAccessService?: BoardAccessService;
  publicSessionService?: PublicSessionService;
  publicBoardReadService?: PublicBoardReadService;
  queueMutationService?: QueueMutationService;
  rateLimiter?: RateLimiter;
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
  const boardAccessService = deps.boardAccessService ?? createDbBoardAccessService(db, config);
  const publicSessionService =
    deps.publicSessionService ?? createDbPublicSessionService(db, config);
  const publicBoardReadService =
    deps.publicBoardReadService ?? createDbPublicBoardReadService(db, config, publicSessionService);
  const rateLimiter = deps.rateLimiter ?? createDbRateLimiter(db);
  const queueMutationService =
    deps.queueMutationService ??
    createDbQueueMutationService(db, config, publicSessionService, rateLimiter);

  const adminRouteDeps = {
    authService: adminAuthService,
    boardManagementService,
    orgManagementService,
    venueManagementService,
    boardAccessService,
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
  return new Elysia({
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
    .onError(({ error, set }) => {
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
}

export function createTestApp(deps: AppDeps = {}) {
  return createApp(deps);
}
