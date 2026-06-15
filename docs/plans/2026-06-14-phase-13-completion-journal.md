# Phase 13 Completion Journal — Docker and Homelab Deployment

**Date:** 2026-06-14  
**Status:** Complete  
**Evidence:** PR #40 (compose + Dockerfiles), PR #41 (deployment docs)

## Summary

Phase 13 delivered Docker Compose stacks and deployment documentation for local development and homelab operation. Work was split across two PRs: compose infrastructure first (PR #40, worker 2), then docs and plan markers (PR #41, this PR).

| PR  | Scope              | Worker / lane     | Result                                                          |
| --- | ------------------ | ----------------- | --------------------------------------------------------------- |
| #40 | Task 13.1 + 13.2   | `hermes-cursor-2` | `docker-compose.yml`, `docker-compose.homelab.yml`, Dockerfiles |
| #41 | Docs + plan marker | `hermes-cursor-3` | Deployment guides, README section, Phase 13 status update       |

## Delivered Files

### PR #40 (compose — from frozen contract)

```text
docker-compose.yml              # full dev stack — api + admin + display + qr-postgres :5432
docker-compose.homelab.yml      # app-only overlay — external Postgres + Traefik
Dockerfile.api                  # qr-api container, Bun + Elysia
Dockerfile.admin-web            # qr-admin container, SvelteKit
Dockerfile.public-web           # qr-display container, SvelteKit
```

### PR #41 (docs — this PR)

```text
docs/deployment/local-development.md          # dev compose quickstart, migrate/seed, bare-bun dev
docs/deployment/homelab-traefik-postgres.md   # homelab prereqs, env, Traefik labels, backups, upgrades
README.md                                      # "Deploy with Docker" section + deployment docs links
docs/plans/2026-06-13-mvp-implementation-plan.md  # Phase 13 marked complete
docs/plans/2026-06-14-phase-13-completion-journal.md  # this file
```

## Service Contract

| Service | Port | Container |
|---------|------|-----------|
| API | 3002 | `qr-api` |
| Admin web | 3001 | `qr-admin` |
| Public/display web | 3000 | `qr-display` |
| Postgres (dev compose only) | 5432 | `qr-postgres` |

## Key Design Decisions

**Two compose files, not one.** `docker-compose.yml` provides a batteries-included local dev experience including Postgres. `docker-compose.homelab.yml` is an app-only overlay that expects external Postgres and Traefik — it never starts either, which matches the homelab architecture where both are shared services.

**`TRUST_PROXY=true` is a homelab requirement.** The API reads the real client IP from `X-Forwarded-For` only when this flag is set. Without it, reverse-proxy deployments break rate limiting (all mutations appear to come from the proxy IP) and audit metadata. The docs call this out explicitly.

**Migration and seed are operator responsibilities.** The compose stacks do not auto-migrate on start. This matches Drizzle's migration model and avoids race conditions in multi-replica futures. Operators run `db:migrate` and `db:seed` explicitly after first start.

## Verification

Doc sanity check (all compose paths and env names reference the frozen contract):

```bash
grep -R "docker-compose" docs/deployment/ README.md
grep -R "TRUST_PROXY" docs/deployment/
grep -R "qr-api\|qr-admin\|qr-display\|qr-postgres" docs/deployment/ README.md
```

Full smoke (post PR #40 merge):

```bash
docker compose up --build -d
bun run --cwd packages/db db:migrate
bun run --cwd packages/db db:seed
curl http://localhost:3002/healthz   # {"ok":true}
open http://localhost:3001           # admin login
```

## Acceptance — Pending

- [x] Docs match compose contract (filenames, ports, container names, env vars)
- [x] `TRUST_PROXY=true` documented and motivated
- [x] Homelab mode explicitly does not start Postgres or Traefik
- [x] Backup and upgrade procedures documented
- [ ] Full stack smoke on fresh Linux host (gate: post PR #40 merge)

## Next Phase

Phase 14 — MVP Hardening and Review (`bun run check` full gate, operator README polish, any remaining TODOs).
