import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

/** Transaction handle passed to `db.transaction()` callbacks (postgres-js driver). */
export type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl);
  return drizzle(client, { schema });
}

export function createDbFromEnv(env: Record<string, string | undefined> = process.env): Database {
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return createDb(databaseUrl);
}
