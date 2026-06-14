import { defineConfig } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const E2E_ENV_DEFAULTS = [
  "DATABASE_URL=postgres://queue_reminiscence:queue_reminiscence@localhost:5433/queue_reminiscence",
  "PUBLIC_APP_URL=http://localhost:3000",
  "ADMIN_APP_URL=http://localhost:3001",
  "API_PUBLIC_BASE_URL=http://localhost:3002/api",
  "API_ADMIN_BASE_URL=http://localhost:3002/api",
  "SESSION_SECRET=e2e-session-secret-change-me",
  "TOKEN_HMAC_SECRET=e2e-token-hmac-secret",
  "RATE_LIMIT_HMAC_SECRET=e2e-rate-limit-hmac-secret",
  "TRUST_PROXY=false",
  "ADMIN_SESSION_TTL_DAYS=14",
  "PUBLIC_MUTATION_SESSION_TTL_HOURS=8",
  "SEED_ADMIN_EMAIL=admin@example.com",
  "SEED_ADMIN_PASSWORD=e2e-admin-password",
].join("\n");

const envPath = resolve(process.cwd(), ".env");
if (!existsSync(envPath)) {
  writeFileSync(envPath, E2E_ENV_DEFAULTS + "\n", "utf8");
}

for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

function e(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

const webServerEnv: Record<string, string> = {
  DATABASE_URL: e("DATABASE_URL"),
  SESSION_SECRET: e("SESSION_SECRET"),
  TOKEN_HMAC_SECRET: e("TOKEN_HMAC_SECRET"),
  RATE_LIMIT_HMAC_SECRET: e("RATE_LIMIT_HMAC_SECRET"),
  PUBLIC_APP_URL: e("PUBLIC_APP_URL"),
  ADMIN_APP_URL: e("ADMIN_APP_URL"),
  API_PUBLIC_BASE_URL: e("API_PUBLIC_BASE_URL"),
  API_ADMIN_BASE_URL: e("API_ADMIN_BASE_URL"),
  SEED_ADMIN_EMAIL: e("SEED_ADMIN_EMAIL"),
  SEED_ADMIN_PASSWORD: e("SEED_ADMIN_PASSWORD"),
  TRUST_PROXY: e("TRUST_PROXY", "false"),
  ADMIN_SESSION_TTL_DAYS: e("ADMIN_SESSION_TTL_DAYS", "14"),
  PUBLIC_MUTATION_SESSION_TTL_HOURS: e("PUBLIC_MUTATION_SESSION_TTL_HOURS", "8"),
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "bun run --cwd apps/api start",
      port: 3002,
      reuseExistingServer: !process.env.CI,
      env: webServerEnv,
    },
    {
      command: "bun run --cwd apps/public-web dev --port 3000 --host 127.0.0.1",
      port: 3000,
      reuseExistingServer: !process.env.CI,
      env: webServerEnv,
    },
    {
      command: "bun run --cwd apps/admin-web dev --port 3001 --host 127.0.0.1",
      port: 3001,
      reuseExistingServer: !process.env.CI,
      env: webServerEnv,
    },
  ],
});
