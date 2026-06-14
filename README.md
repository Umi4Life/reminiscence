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

## Current status

Phases 0–8 of the MVP implementation plan are complete on `main`.

Current backend capabilities include:

- admin session auth and RBAC
- admin organization/venue/board management
- board open/close/reset operations
- board access-credential rotation
- public access claim and mutation-session cookies
- public board read, events, and add/remove mutations
- HMAC audit metadata on public mutations
- Postgres-backed public mutation rate limiting

Merged-main quality gate (2026-06-14): `bun run check` — 183 tests passing.

See the MVP plan for the build sequence:

- [`docs/plans/2026-06-13-mvp-implementation-plan.md`](docs/plans/2026-06-13-mvp-implementation-plan.md)

## Product and architecture docs

- [`docs/product/queue-reminiscence-prd.md`](docs/product/queue-reminiscence-prd.md)
- [`docs/architecture/mvp-technical-architecture.md`](docs/architecture/mvp-technical-architecture.md)
