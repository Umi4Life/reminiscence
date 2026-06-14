# Queue Reminiscence

Queue Reminiscence is an operator-managed digital queue board for arcades and casual venues.

It preserves the familiar behavior of paper queue sheets while adding QR-derived edit access, public activity history, staff controls, soft deletion, and a future-friendly display-state API.

## MVP scope

The MVP is focused on:

- admin/operator accounts
- Organization → Venue → Board hierarchy
- readable public board slugs
- no participant accounts
- QR/access-code-derived public mutation sessions
- public add/remove for anyone with valid current access
- visible board events
- soft-deleted queue entries
- display-state support for polling displays
- local development with Docker/Postgres
- homelab deployment with external Postgres and Traefik

Out of scope for MVP: participant accounts, billing, SaaS signup, queue reordering, notifications, CAPTCHA by default, and MQTT publishing as a required feature.

## Repository layout

```text
apps/
  api/          # Bun + Elysia API
  public-web/   # SvelteKit participant app
  admin-web/    # SvelteKit operator app
packages/
  config/       # shared environment parsing
  db/           # Drizzle schema and migrations
  domain/       # shared domain validation and policies
  ui/           # shared UI package placeholder
docs/
  architecture/
  plans/
  product/
```

## Development

This project uses Bun workspaces.

```bash
bun install
bun run check
```

After Postgres is running and migrations are applied, seed the local demo org, venue, board, and admin:

```bash
cp .env.example .env
# set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env
bun run --cwd packages/db db:migrate
bun run --cwd packages/db db:seed
```

Current quality gate:

```bash
bun run format:check
bun run lint
bun run typecheck
bun test --pass-with-no-tests
```

## Configuration

Copy `.env.example` to `.env` for local development and replace placeholder secrets before running services.

Required core variables include:

- `DATABASE_URL`
- `PUBLIC_APP_URL`
- `ADMIN_APP_URL`
- `API_PUBLIC_BASE_URL`
- `API_ADMIN_BASE_URL`
- `SESSION_SECRET`
- `TOKEN_HMAC_SECRET`
- `RATE_LIMIT_HMAC_SECRET`
- `TRUST_PROXY`
- `ADMIN_SESSION_TTL_DAYS`
- `PUBLIC_MUTATION_SESSION_TTL_HOURS`

## Deploy with Docker

Queue Reminiscence ships as three containerized apps (`qr-api`, `qr-admin`, `qr-display`). Two compose files are provided (from PR #40):

| File | Use case |
|------|----------|
| `docker-compose.yml` | Local dev — full stack including Postgres (`qr-postgres` on :5432) |
| `docker-compose.homelab.yml` | Homelab — app-only overlay for external Postgres + Traefik |

Quick start (local dev):

```bash
cp .env.example .env
# Set SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, and rotate the three secret values
docker compose up --build -d
bun run --cwd packages/db db:migrate
bun run --cwd packages/db db:seed
```

Open `http://localhost:3001` and sign in with your seed admin credentials.

For a homelab deployment with external Postgres and Traefik, set `TRUST_PROXY=true` in `.env`.

Full guides:

- [Local development quickstart](docs/deployment/local-development.md)
- [Homelab deployment with Traefik + external Postgres](docs/deployment/homelab-traefik-postgres.md)

## Current status

Phases 0–12 of the MVP implementation plan are complete on `main`. Next up: Phase 13 (Docker / homelab deployment) and Phase 14 (hardening / review).

Current capabilities include:

- admin session auth and RBAC
- admin organization/venue/board management
- board open/close/reset operations
- board access-credential rotation
- public access claim and mutation-session cookies
- public board read, events, and add/remove mutations
- HMAC audit metadata on public mutations
- Postgres-backed public mutation rate limiting
- QR SVG generation for public access URLs
- display-state polling API with ETag/304 support
- **public web app** (`apps/public-web/`, port **3000**) — `/q/[accessCode]` claim and `/b/[publicSlug]` board UI
- **admin web app** (`apps/admin-web/`, port **3001**) — login, dashboard, board operations, QR preview, create/edit/delete boards
- **E2E tests** (Playwright) — MVP critical path via `bun run e2e`

Merged-main quality gate (2026-06-14): `bun run check` — 225 unit tests passing; 6 `createDbRateLimiter` integration tests require local Postgres.

### Local three-app dev

With Postgres running and migrations applied:

```bash
cp .env.example .env
# set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env
bun run --cwd packages/db db:migrate
bun run --cwd packages/db db:seed

# terminal 1 — API on :3002
bun run --cwd apps/api dev

# terminal 2 — public web on :3000
bun run --cwd apps/public-web dev

# terminal 3 — admin web on :3001
bun run --cwd apps/admin-web dev
```

Open `http://localhost:3001`, sign in with seed admin credentials, open a board, rotate the QR link, then open the access URL in another tab (or on a phone). `PUBLIC_APP_URL` in the root `.env` must be exactly `http://localhost:3000` for CORS and public session cookies.

### E2E tests

Playwright boots its own Postgres container (`qr-smoke-p12` on :5433), migrates, seeds, and starts all three apps:

```bash
bun run e2e:install   # once — Chromium + system deps
bun run e2e
```

See [`tests/e2e/README.md`](tests/e2e/README.md) for ports and prerequisites.

See the MVP plan for the build sequence:

- [`docs/plans/2026-06-13-mvp-implementation-plan.md`](docs/plans/2026-06-13-mvp-implementation-plan.md)

## Product and architecture docs

- [`docs/product/queue-reminiscence-prd.md`](docs/product/queue-reminiscence-prd.md)
- [`docs/architecture/mvp-technical-architecture.md`](docs/architecture/mvp-technical-architecture.md)

## Deployment docs

- [`docs/deployment/local-development.md`](docs/deployment/local-development.md)
- [`docs/deployment/homelab-traefik-postgres.md`](docs/deployment/homelab-traefik-postgres.md)
