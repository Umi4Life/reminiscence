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
import { ApiError } from "./http/errors";
import { apiFailure } from "./http/response";
import { createDbPublicBoardReadService, type PublicBoardReadService } from "./queue/read";
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
  const queueMutationService =
    deps.queueMutationService ?? createDbQueueMutationService(db, config, publicSessionService);

  const adminRouteDeps = {
    authService: adminAuthService,
    boardManagementService,
    boardAccessService,
  };

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
    .use(adminAuthRoutes({ authService: adminAuthService, config }))
    .use(adminOrganizationsRoutes(adminRouteDeps))
    .use(adminVenuesRoutes(adminRouteDeps))
    .use(adminBoardsRoutes(adminRouteDeps))
    .use(publicAccessRoutes({ config, publicSessionService }))
    .use(publicBoardsRoutes({ config, publicBoardReadService, queueMutationService }));
}

export function createTestApp(deps: AppDeps = {}) {
  return createApp(deps);
}
