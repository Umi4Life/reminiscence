import type { AppConfig } from "@queue-reminiscence/config";
import { parseEnv } from "@queue-reminiscence/config/env";
import type { Database } from "@queue-reminiscence/db";
import { createDb } from "@queue-reminiscence/db";
import { Elysia } from "elysia";

import { createDbAdminAuthService, type AdminAuthService } from "./auth/admin-sessions";
import { ApiError } from "./http/errors";
import { apiFailure } from "./http/response";
import { adminAuthRoutes } from "./routes/admin-auth";
import { healthRoutes, isDatabaseReachable } from "./routes/health";

export interface AppDeps {
  config?: AppConfig;
  db?: Database;
  checkDatabase?: () => Promise<boolean>;
  adminAuthService?: AdminAuthService;
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

  return new Elysia({ name: "queue-reminiscence-api" })
    .onError(({ error, set }) => {
      if (error instanceof ApiError) {
        set.status = error.status;
        return apiFailure(error);
      }

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
    .use(adminAuthRoutes({ authService: adminAuthService, config }));
}

export function createTestApp(deps: AppDeps = {}) {
  return createApp(deps);
}
