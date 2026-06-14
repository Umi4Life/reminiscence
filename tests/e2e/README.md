# E2E Tests

Browser end-to-end tests using [Playwright](https://playwright.dev/).

## Prerequisites

- Docker (for the `qr-smoke-p12` Postgres container)
- Bun (`$HOME/.bun/bin/bun` in PATH)
- Chromium — run once: `bun run e2e:install`

## Ports

| Service    | Port                            |
| ---------- | ------------------------------- |
| public-web | 3000                            |
| admin-web  | 3001                            |
| API        | 3002                            |
| Postgres   | 5433 (container `qr-smoke-p12`) |

## Running tests

```bash
# Run all E2E tests
bun run e2e

# Run a specific spec file
bun run e2e tests/e2e/smoke.spec.ts
```

## How the stack starts

1. `global-setup.ts` starts (or creates) the `qr-smoke-p12` Postgres container on host port **5433**, waits for `pg_isready`, writes a root `.env` if one is not present, then runs `db:migrate` and `db:seed`.
2. Playwright starts the three `webServer` processes — API on **3002**, public-web on **3000**, admin-web on **3001** — passing all required env vars from the root `.env`.
3. Tests run against the live stack. `reuseExistingServer: true` (non-CI) lets you keep the stack running between runs.

## Seed data

The seed board used by E2E tests is **CHUNITHM Gold** with public slug `local-demo-venue-chunithm-gold`. The seed admin credentials are set by `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env` (defaults: `admin@example.com` / `e2e-admin-password`).
