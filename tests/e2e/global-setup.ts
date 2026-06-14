import { execSync } from "child_process";
import { existsSync, writeFileSync } from "fs";
import { resolve } from "path";

const CONTAINER = "qr-smoke-p12";
const PG_PORT = 5433;
const PG_USER = "queue_reminiscence";
const ROOT = resolve(process.cwd());

function runSilent(cmd: string): void {
  execSync(cmd, { stdio: "pipe" });
}

async function startPostgres(): Promise<void> {
  try {
    runSilent(`docker start ${CONTAINER}`);
    console.log(`[global-setup] Started existing container ${CONTAINER}`);
  } catch {
    console.log(`[global-setup] Creating container ${CONTAINER}`);
    execSync(
      `docker run -d --name ${CONTAINER} ` +
        `-e POSTGRES_USER=${PG_USER} ` +
        `-e POSTGRES_PASSWORD=${PG_USER} ` +
        `-e POSTGRES_DB=${PG_USER} ` +
        `-p ${PG_PORT}:5432 postgres:16-alpine`,
      { stdio: "inherit" },
    );
  }
}

async function waitForPostgres(): Promise<void> {
  console.log("[global-setup] Waiting for Postgres...");
  for (let i = 0; i < 60; i++) {
    try {
      runSilent(`docker exec ${CONTAINER} pg_isready -h localhost -p 5432 -U ${PG_USER}`);
      console.log("[global-setup] Postgres is ready.");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`Postgres on :${PG_PORT} did not become ready in 60 seconds`);
}

function writeEnvIfMissing(): void {
  const envPath = resolve(ROOT, ".env");
  if (existsSync(envPath)) return;
  const content =
    [
      `DATABASE_URL=postgres://${PG_USER}:${PG_USER}@localhost:${PG_PORT}/${PG_USER}`,
      `PUBLIC_APP_URL=http://localhost:3000`,
      `ADMIN_APP_URL=http://localhost:3001`,
      `API_PUBLIC_BASE_URL=http://localhost:3002/api`,
      `API_ADMIN_BASE_URL=http://localhost:3002/api`,
      `SESSION_SECRET=e2e-session-secret-change-me`,
      `TOKEN_HMAC_SECRET=e2e-token-hmac-secret`,
      `RATE_LIMIT_HMAC_SECRET=e2e-rate-limit-hmac-secret`,
      `TRUST_PROXY=false`,
      `ADMIN_SESSION_TTL_DAYS=14`,
      `PUBLIC_MUTATION_SESSION_TTL_HOURS=8`,
      `SEED_ADMIN_EMAIL=admin@example.com`,
      `SEED_ADMIN_PASSWORD=e2e-admin-password`,
    ].join("\n") + "\n";
  writeFileSync(envPath, content, "utf8");
  console.log(`[global-setup] Wrote ${envPath}`);
}

function resetBoardState(): void {
  console.log("[global-setup] Resetting board state...");
  const boardId = "(SELECT id FROM boards WHERE slug = 'chunithm-gold')";
  const sql = [
    `UPDATE queue_entries SET removed_by_event_id = NULL WHERE board_id = ${boardId};`,
    `DELETE FROM audit_metadata WHERE event_id IN (SELECT id FROM board_events WHERE board_id = ${boardId});`,
    `DELETE FROM board_events WHERE board_id = ${boardId};`,
    `DELETE FROM queue_entries WHERE board_id = ${boardId};`,
    `UPDATE boards SET status = 'closed' WHERE slug = 'chunithm-gold';`,
  ].join(" ");
  runSilent(`docker exec ${CONTAINER} psql -U ${PG_USER} -d ${PG_USER} -c "${sql}"`);
  console.log("[global-setup] Board state reset.");
}

export default async function globalSetup(): Promise<void> {
  await startPostgres();
  await waitForPostgres();
  writeEnvIfMissing();

  const bunBin = `${process.env.HOME}/.bun/bin`;
  const env = { ...process.env, PATH: `${bunBin}:${process.env.PATH ?? ""}` };

  console.log("[global-setup] Running db:migrate...");
  execSync("bun run --cwd packages/db db:migrate", { stdio: "inherit", env });

  console.log("[global-setup] Running db:seed...");
  execSync("bun run --cwd packages/db db:seed", { stdio: "inherit", env });

  resetBoardState();
}
