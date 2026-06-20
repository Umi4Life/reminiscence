# Reminiscence

> An operator-managed digital queue board for arcades and casual venues — the feel of a paper queue sheet, with QR-derived edit access, public history, and staff controls.

<p>
  <img alt="Runtime: Bun" src="https://img.shields.io/badge/Runtime-Bun%201.2-black?logo=bun&logoColor=white">
  <img alt="API: Elysia.js" src="https://img.shields.io/badge/API-Elysia.js%201.4-7B3FE4?logo=elysia&logoColor=white">
  <img alt="Frontend: Svelte" src="https://img.shields.io/badge/Frontend-Svelte%205%20%2F%20SvelteKit%202-FF3E00?logo=svelte&logoColor=white">
  <img alt="Database: PostgreSQL" src="https://img.shields.io/badge/Database-PostgreSQL%2016-4169E1?logo=postgresql&logoColor=white">
</p>

**Built with [Bun](https://bun.sh) · [Elysia.js](https://elysiajs.com) · [Svelte](https://svelte.dev).** A single Bun workspace runs an Elysia API and two SvelteKit apps end to end.

## What it is

Queue Reminiscence replaces the paper queue sheet at an arcade cabinet (or any casual venue) while keeping its social, no-account culture intact:

- **No participant accounts.** Players scan the board's current QR, see a readable URL, type any display name, and add or remove themselves. No signup, no login.
- **QR-derived access.** Edit access comes from the current, rotating QR credential. Staff rotate it to cut off abuse — old codes simply stop working.
- **Visible history.** Every add, remove, reset, open, and close is logged and publicly viewable, so the board self-moderates the way a physical one does.
- **Operator-managed.** Venue staff own the boards from a separate admin app — open/close/reset, soft-delete entries, rotate access — under an Organization → Venue → Board hierarchy.
- **Display-friendly.** A polling display-state API (ETag/304) feeds e-ink boards and other read-only displays.

## Tech stack

| Layer            | Technology                               | Where             | Port   |
| ---------------- | ---------------------------------------- | ----------------- | ------ |
| Runtime / PM     | **Bun** 1.2.23 (workspaces)              | repo root         | —      |
| API              | **Elysia.js** 1.4 on Bun                 | `apps/api`        | `3002` |
| Public web       | **SvelteKit 2 / Svelte 5**               | `apps/public-web` | `3000` |
| Admin web        | **SvelteKit 2 / Svelte 5**               | `apps/admin-web`  | `3001` |
| Database         | **PostgreSQL 16** + Drizzle ORM          | `packages/db`     | `5432` |
| API docs         | OpenAPI (generated) + Eden Treaty client | `apps/api`        | `3002` |
| End-to-end tests | Playwright (isolated Postgres)           | `tests/e2e`       | `5433` |

## Architecture at a glance

```text
apps/
  api/          # Bun + Elysia.js API — owns all state, auth, and business logic
  public-web/   # SvelteKit participant app — claim access + view/edit board
  admin-web/    # SvelteKit operator app — manage boards, rotate QR, operations
packages/
  config/       # shared environment parsing & runtime config
  db/           # Drizzle schema, migrations, and seed
  domain/       # shared domain validation and policies
  ui/           # shared CSS tokens / base styles
docs/
  deployment/   # living operational guides (local + homelab)
  journal/      # preserved MVP build history (architecture, plans, product)
```

The API is the single source of truth: the SvelteKit apps call it through a type-safe [Eden Treaty](https://elysiajs.com/eden/treaty/overview.html) client (the server's `App` type is imported from `@queue-reminiscence/api/types`) and hold no authorization logic of their own.

## Quick start (local, bare Bun)

You need [Bun](https://bun.sh) ≥ 1.2.23 and a PostgreSQL 16 instance.

```bash
# 1. Install workspace dependencies
bun install

# 2. Start Postgres (any way you like — e.g. Docker)
docker run --name qr-pg -p 5432:5432 \
  -e POSTGRES_USER=reminiscence \
  -e POSTGRES_PASSWORD=reminiscence \
  -e POSTGRES_DB=reminiscence \
  -d postgres:16-alpine

# 3. Configure environment
cp .env.example .env
# Set SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, and rotate the three *_SECRET values

# 4. Migrate and seed the demo org / venue / board / admin
bun run --cwd packages/db db:migrate
bun run --cwd packages/db db:seed
```

Then run the three apps, each in its own terminal:

```bash
bun run --cwd apps/api dev          # API        → http://localhost:3002
bun run --cwd apps/public-web dev   # Public web  → http://localhost:3000
bun run --cwd apps/admin-web dev    # Admin web   → http://localhost:3001
```

Open <http://localhost:3001>, sign in with your seed admin credentials, open the demo board, rotate the QR link, then open the access URL in another tab (or on a phone).

> **Heads up:** `PUBLIC_APP_URL` in the root `.env` must be exactly `http://localhost:3000` — public session cookies and CORS depend on an exact origin match.

## Quick start (Docker Compose)

The full stack, Postgres included:

```bash
cp .env.example .env
# Set SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, and rotate the three *_SECRET values
docker compose up --build -d
bun run --cwd packages/db db:migrate
bun run --cwd packages/db db:seed
```

Then open <http://localhost:3001>. See [`docs/deployment/local-development.md`](docs/deployment/local-development.md) for the service map and troubleshooting, and [`docs/deployment/homelab-traefik-postgres.md`](docs/deployment/homelab-traefik-postgres.md) for a homelab deployment with external Postgres + Traefik (`TRUST_PROXY=true`).

## API docs

The Elysia API serves an interactive **OpenAPI UI at <http://localhost:3002/api/docs>** (raw spec at `/api/docs/json`) once the API is running. The document is generated directly from the route schemas by `@elysia/openapi` — there is no hand-maintained spec file to keep in sync.

### Elysia conventions

The API follows Elysia's recommended patterns:

- **Controllers as plugins** — each route group is a named `Elysia` instance (one instance = one controller); handlers chain for end-to-end type inference.
- **Schemas as the single source of truth** — every request/response shape is a TypeBox (`t`) schema in `apps/api/src/http/schemas.ts`; reusable inputs and the error envelope are registered via `.model()` so the OpenAPI document emits shared `#/components/schemas` entries.
- **Type-safe clients** — the web apps use **Eden Treaty** (`@elysia/eden`) against the exported `App` type, so client and server never drift.
- **Auth by design, not plugin** — sessions are opaque, server-side, HMAC'd cookies (intentionally not `@elysiajs/jwt`/`bearer`, so credentials are revocable), and CORS + CSRF live in one dedicated request hook (`apps/api/src/http/`) rather than a generic CORS plugin, keeping the origin allowlist and cross-origin mutation checks together.

## Configuration

Copy `.env.example` to `.env` and replace the placeholder secrets before running anything. Required core variables:

`DATABASE_URL`, `PUBLIC_APP_URL`, `ADMIN_APP_URL`, `API_PUBLIC_BASE_URL`, `API_ADMIN_BASE_URL`, `SESSION_SECRET`, `TOKEN_HMAC_SECRET`, `RATE_LIMIT_HMAC_SECRET`, `TRUST_PROXY`, `ADMIN_SESSION_TTL_DAYS`, `PUBLIC_MUTATION_SESSION_TTL_HOURS`.

The three `*_SECRET` values must be ≥ 32 chars in production and must never be left as `change-me-in-development`. See [`docs/deployment/local-development.md`](docs/deployment/local-development.md) for a full table with examples.

## Testing

```bash
# Quality gate — format, lint, typecheck, unit tests
bun run check

# End-to-end (Playwright)
bun run e2e:install   # once — installs Chromium + system deps
bun run e2e
```

The e2e suite boots its **own isolated Postgres container on port 5433** (never the dev database), migrates, seeds, and starts all three apps before running.

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — dev setup, workspace layout, quality gate, conventions.
- [`docs/deployment/`](docs/deployment/) — local and homelab operational guides.
- [`docs/journal/`](docs/journal/) — preserved MVP build history (architecture, product PRD, and the 14-phase plan + completion journals).

## Status

**MVP complete** — Phases 0–14 are merged on `main`. Latest quality gate: `bun run check` green (231 unit tests; 6 `createDbRateLimiter` cases skip without `DATABASE_URL`), `bun run e2e` 10/10 passing.

CI builds a single combined Docker image and publishes it to `ghcr.io/<owner>/queue-reminiscence` on every merge to `main` (tagged `:latest` and `:<git-sha>`). At container start, the `APP` environment variable selects which process to run (`api`, `admin-web`, or `public-web`).
