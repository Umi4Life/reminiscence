import { parseEnv } from "@queue-reminiscence/config/env";
import { createDb } from "@queue-reminiscence/db";

import { createApp } from "./app";
import { createDbRateLimiter, startRateLimitSweeper } from "./rate-limit/rate-limiter";

const runtimeGlobal = globalThis as typeof globalThis & {
  Bun?: { env: Record<string, string | undefined> };
  process?: { env: Record<string, string | undefined> };
};

const config = parseEnv(runtimeGlobal.Bun?.env ?? runtimeGlobal.process?.env ?? {});
const db = createDb(config.databaseUrl);
const rateLimiter = createDbRateLimiter(db);
const app = createApp({ config, db, rateLimiter });

startRateLimitSweeper(rateLimiter);

app.listen({
  hostname: "0.0.0.0",
  port: Number(process.env.PORT ?? 3002),
});

console.log(
  `queue-reminiscence-api listening on http://0.0.0.0:${Number(process.env.PORT ?? 3002)}`,
);

export { app };
