import type { AppConfig } from "@queue-reminiscence/config";
import { parseEnv } from "@queue-reminiscence/config/env";
import type { Database } from "@queue-reminiscence/db";
import { createDb } from "@queue-reminiscence/db";
import { Elysia } from "elysia";

import {
  createDbBoardManagementService,
  type BoardManagementService,
} from "./admin/board-management";
import { createDbBoardAccessService, type BoardAccessService } from "./access/board-access";
import { createDbAdminAuthService, type AdminAuthService } from "./auth/admin-sessions";
import { createDbPublicSessionService, type PublicSessionService } from "./auth/public-sessions";
import { buildAllowedOrigins, resolveCors } from "./http/cors";
import { adminOriginOf, isForbiddenAdminCrossOrigin } from "./http/csrf";
import { ApiError, forbiddenError } from "./http/errors";
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
import { healthRoutes, isDatabaseReachable } from "./routes/health";

export interface AppDeps {
  config?: AppConfig;
  db?: Database;
  checkDatabase?: () => Promise<boolean>;
  adminAuthService?: AdminAuthService;
  boardManagementService?: BoardManagementService;
  boardAccessService?: BoardAccessService;
  publicSessionService?: PublicSessionService;
  publicBoardReadService?: PublicBoardReadService;
  queueMutationService?: QueueMutationService;
  rateLimiter?: RateLimiter;
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
    boardAccessService,
  };

  const allowedOrigins = buildAllowedOrigins(config);
  const adminOrigin = adminOriginOf(config);

  return new Elysia({ name: "queue-reminiscence-api" })
    .onRequest(({ request, set }) => {
      const { headers, preflight } = resolveCors(allowedOrigins, request);
      Object.assign(set.headers, headers);

      if (preflight) {
        set.status = 204;
        return "";
      }

      // CSRF defense-in-depth: reject admin mutations from a foreign origin.
      if (isForbiddenAdminCrossOrigin(request, adminOrigin)) {
        set.status = 403;
        return apiFailure(forbiddenError("Cross-origin request rejected."));
      }
    })
    .onError(({ error, set }) => {
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
    .use(publicBoardsRoutes({ config, publicBoardReadService, queueMutationService }));
}

export function createTestApp(deps: AppDeps = {}) {
  return createApp(deps);
}
