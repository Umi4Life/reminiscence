# Local Development — Docker Compose Quickstart

This guide covers running the full Queue Reminiscence stack locally using Docker Compose.

> **Compose files:** `docker-compose.yml` (full dev stack with Postgres) is delivered in PR #40.  
> Until that PR is merged, start Postgres separately and run the apps with `bun run dev` (see [Bare-Bun Dev](#bare-bun-dev) below).

## Prerequisites

- Docker ≥ 24 with the Compose plugin (`docker compose version`)
- Bun ≥ 1.1 for migration and seed scripts (`bun --version`)

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/Umi4Life/queue-reminiscence.git
cd queue-reminiscence
bun install

# 2. Configure environment
cp .env.example .env
# Edit .env — set SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, and rotate the three secret values
```

### Start the full stack

```bash
docker compose up --build -d
```

This starts:

| Container | Port | Description |
|-----------|------|-------------|
| `qr-postgres` | 5432 | PostgreSQL database |
| `qr-api` | 3002 | Bun + Elysia API |
| `qr-admin` | 3001 | SvelteKit admin web app |
| `qr-display` | 3000 | SvelteKit public/display web app |

### Run migrations and seed

On first run (and after schema changes):

```bash
bun run --cwd packages/db db:migrate
bun run --cwd packages/db db:seed
```

The seed creates:
- Organization: `umi4life-demo`
- Venue: `local-demo-venue`
- Board: `chunithm-gold`
- Admin user from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`

### Verify

Open `http://localhost:3001` and sign in with your seed admin credentials.

Navigate to the demo board, rotate the QR link, then open the access URL at `http://localhost:3000` in another tab.

`PUBLIC_APP_URL` in `.env` must be exactly `http://localhost:3000` for CORS and public session cookies to work.

---

## Environment Variables

| Variable | Example | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgres://queue_reminiscence:queue_reminiscence@localhost:5432/queue_reminiscence` | Postgres DSN |
| `PUBLIC_APP_URL` | `http://localhost:3000` | Must match exactly for CORS |
| `ADMIN_APP_URL` | `http://localhost:3001` | Admin app origin |
| `API_PUBLIC_BASE_URL` | `http://localhost:3002/api` | Public app → API |
| `API_ADMIN_BASE_URL` | `http://localhost:3002/api` | Admin app → API |
| `SESSION_SECRET` | _(random 32+ bytes)_ | Admin session signing |
| `TOKEN_HMAC_SECRET` | _(random 32+ bytes)_ | Access token HMAC |
| `RATE_LIMIT_HMAC_SECRET` | _(random 32+ bytes)_ | Rate-limit bucket keying |
| `TRUST_PROXY` | `false` | Leave `false` for local dev |
| `ADMIN_SESSION_TTL_DAYS` | `14` | Admin cookie lifetime |
| `PUBLIC_MUTATION_SESSION_TTL_HOURS` | `8` | Public session lifetime |
| `SEED_ADMIN_EMAIL` | `admin@example.com` | Seed script only |
| `SEED_ADMIN_PASSWORD` | _(strong password)_ | Seed script only |

---

## Useful Commands

```bash
# Tail logs for a specific service
docker compose logs -f qr-api

# Restart a single service after code changes
docker compose up --build -d qr-api

# Stop everything (keeps volumes)
docker compose down

# Stop everything and wipe the database
docker compose down -v

# Re-run migrations after a schema change
bun run --cwd packages/db db:migrate
```

---

## Bare-Bun Dev

If you prefer to run apps without Docker (pre-PR #40, or for rapid iteration):

```bash
# Start Postgres however you like (Docker, Homebrew, system package)
# Then:
cp .env.example .env
bun run --cwd packages/db db:migrate
bun run --cwd packages/db db:seed

# Three terminals:
bun run --cwd apps/api dev           # :3002
bun run --cwd apps/public-web dev    # :3000
bun run --cwd apps/admin-web dev     # :3001
```

---

## E2E Tests

Playwright boots its own isolated Postgres container (`qr-smoke-p12` on :5433), migrates, seeds, and starts all three apps:

```bash
bun run e2e:install   # once — Chromium + system deps
bun run e2e
```

See [`tests/e2e/README.md`](../../tests/e2e/README.md) for ports and prerequisites.
