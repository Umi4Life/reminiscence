import type { AppConfig } from "@queue-reminiscence/config";
import { createDb, type Database } from "@queue-reminiscence/db";

export function getTestDb(): Database | null {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  return createDb(databaseUrl);
}

export const testAppConfig: AppConfig = {
  databaseUrl: "postgres://test:test@127.0.0.1:1/test",
  publicAppUrl: "http://localhost:3000",
  adminAppUrl: "http://localhost:3001",
  apiPublicBaseUrl: "http://localhost:3002/api",
  apiAdminBaseUrl: "http://localhost:3002/api",
  sessionSecret: "test-session-secret",
  tokenHmacSecret: "test-token-hmac-secret",
  rateLimitHmacSecret: "test-rate-limit-hmac-secret",
  trustProxy: true,
  adminSessionTtlDays: 14,
  publicMutationSessionTtlHours: 8,
};
