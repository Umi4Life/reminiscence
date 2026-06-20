import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { adminUsers } from "../../../packages/db/src/schema";

const E2E_DB_URL =
  "postgres://queue_reminiscence:queue_reminiscence@localhost:5433/queue_reminiscence";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "e2e-admin-password";

const sql = postgres(E2E_DB_URL);
const db = drizzle(sql);

const hash = await Bun.password.hash(adminPassword, {
  algorithm: "argon2id",
  memoryCost: 19_456,
  timeCost: 2,
});

await db.update(adminUsers).set({ passwordHash: hash }).where(eq(adminUsers.email, adminEmail));

await sql.end();
console.log(`[reset-admin-password] Reset password for ${adminEmail} to seed value.`);
