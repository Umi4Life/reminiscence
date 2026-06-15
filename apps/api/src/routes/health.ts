import { sql } from "drizzle-orm";
import { Elysia } from "elysia";

import type { Database } from "@queue-reminiscence/db";

export interface HealthRouteDeps {
  checkDatabase?: () => Promise<boolean>;
}

export async function isDatabaseReachable(db: Database): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

export function healthRoutes(deps: HealthRouteDeps = {}) {
  return new Elysia({ name: "health-routes" })
    .get("/healthz", () => ({ ok: true }), {
      detail: {
        summary: "Liveness probe",
        description: "Returns { ok: true } if the process is running. No DB check.",
        tags: ["Health"],
      },
    })
    .get("/readyz", async ({ set }) => {
      const checkDatabase = deps.checkDatabase ?? (async () => false);
      const ready = await checkDatabase();

      if (!ready) {
        set.status = 503;
        return { ok: false };
      }

      return { ok: true };
    }, {
      detail: {
        summary: "Readiness probe",
        description: "Returns { ok: true } only when the database is reachable.",
        tags: ["Health"],
      },
    });
}
