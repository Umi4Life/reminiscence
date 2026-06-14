import type { AppConfig } from "@queue-reminiscence/config";
import type { Database } from "@queue-reminiscence/db";
import { Elysia } from "elysia";

import {
  createDbDisplayDeviceResolver,
  type DisplayDeviceResolver,
} from "../display/display-devices";
import {
  buildDisplayEtag,
  createDbDisplayStateService,
  type DisplayStateService,
} from "../display/display-state";
import { forbiddenError, unauthorizedError } from "../http/errors";
import { apiSuccess } from "../http/response";

export interface DisplayRouteDeps {
  config: AppConfig;
  db: Database;
  displayDeviceResolver?: DisplayDeviceResolver;
  displayStateService?: DisplayStateService;
}

export function displayRoutes(deps: DisplayRouteDeps) {
  const resolver =
    deps.displayDeviceResolver ?? createDbDisplayDeviceResolver(deps.db, deps.config);
  const stateService =
    deps.displayStateService ?? createDbDisplayStateService(deps.db, deps.config);

  return new Elysia({ name: "display-routes" }).get(
    "/api/display/:displayToken/state",
    async ({ params, request, set }) => {
      const { displayToken } = params;

      const device = await resolver.resolveDevice(displayToken);

      if (!device) {
        throw unauthorizedError("Display device not found.");
      }

      if (device.status === "revoked") {
        throw forbiddenError("Display device has been revoked.");
      }

      const payload = await stateService.buildState(device);
      const etag = buildDisplayEtag(payload.displayVersion);

      set.headers["ETag"] = etag;
      set.headers["Cache-Control"] = "no-store";

      const ifNoneMatch = request.headers.get("if-none-match");
      if (ifNoneMatch === etag) {
        set.status = 304;
        return;
      }

      return apiSuccess({ state: payload });
    },
  );
}
