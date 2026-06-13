import { parseEnv } from "@queue-reminiscence/config/env";

import { createApp } from "./app";

const runtimeGlobal = globalThis as typeof globalThis & {
  Bun?: { env: Record<string, string | undefined> };
  process?: { env: Record<string, string | undefined> };
};

const config = parseEnv(runtimeGlobal.Bun?.env ?? runtimeGlobal.process?.env ?? {});
const app = createApp({ config });

app.listen({
  hostname: "0.0.0.0",
  port: Number(process.env.PORT ?? 3002),
});

console.log(
  `queue-reminiscence-api listening on http://0.0.0.0:${Number(process.env.PORT ?? 3002)}`,
);

export { app };
