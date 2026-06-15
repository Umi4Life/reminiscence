# Phase 14 Implementation Plan — MVP Hardening and Review

**Date:** 2026-06-15  
**Base:** `origin/main` @ `77bbc4e` (PR #42 merged — Phases 0–13 complete)  
**Goal:** Pass the full MVP quality gate, close the Final MVP Acceptance Criteria checklist, and mark the MVP implementation plan complete.

## Context

Phase 14 is lighter than build phases. Most security hardening (CSRF, CORS, rate-limit tiers, production secret guards) landed ahead of schedule — see `docs/plans/2026-06-14-security-hardening-journal.md`.

Remaining work at kickoff:

| Item                                     | Status at kickoff                                 |
| ---------------------------------------- | ------------------------------------------------- |
| `bun run check`                          | ✅ 231 pass (Postgres on :5432 available)         |
| `bun run e2e`                            | ❌ → ✅ after localhost origin fix                |
| Prettier drift (6 files)                 | Fixed locally                                     |
| Docker compose healthcheck YAML          | Fixed locally                                     |
| README operator landing                  | Exists — needs Phase 14 status update             |
| Final MVP Acceptance Criteria            | Walk + document                                   |
| Optional: security headers / body limits | Deferred post-MVP unless homelab cutover requires |

## PR split — worker drones

Phase 14 scope is small enough for **two PRs** (not three workers). Worker C stays hot spare / conflict lane.

| PR      | Branch                          | Worker                         | Lane | Scope                                                                                    | Verify                                 |
| ------- | ------------------------------- | ------------------------------ | ---- | ---------------------------------------------------------------------------------------- | -------------------------------------- |
| **#43** | `phase14/e2e-compose-hardening` | **Worker A** (`192.168.1.214`) | Code | `playwright.config.ts`, `docker-compose.yml`, `docker-compose.homelab.yml`               | `bun run e2e`; `docker compose config` |
| **#44** | `docs/phase14-mvp-complete`     | **Hermes** (controller)        | Docs | README status, MVP plan marker, Phase 14 completion journal, Prettier on deployment docs | `bun run check`; acceptance checklist  |

Worker prompts: `/mnt/truenas/hermes/journals/queue-reminiscence/phase14-worker-{1,2}-*.md`

### PR #43 — Worker A: E2E + compose hardening

**Problem 1 — E2E CSRF/CORS:** Dev `.env` may use LAN IPs (`192.168.1.213`) while Playwright browsers hit `localhost`. Admin login fails with "Cross-origin request rejected" because `ADMIN_APP_URL` in the API env does not match the browser origin.

**Fix:** `playwright.config.ts` forces localhost URL env for `webServer` processes regardless of root `.env`.

**Problem 2 — Compose healthcheck:** Nested-quote escaping in `CMD-SHELL` healthcheck broke YAML parsing. Use Compose-safe single-quote doubling.

**Files:**

```text
playwright.config.ts
docker-compose.yml
docker-compose.homelab.yml
```

**Do not touch:** `docs/plans/*`, README status (Hermes PR #44).

### PR #44 — Hermes: MVP closure docs

**Files:**

```text
README.md                              # Phase 14 complete, updated gate numbers
docs/plans/2026-06-13-mvp-implementation-plan.md  # Phase 14 ✅
docs/plans/2026-06-15-phase-14-completion-journal.md
docs/deployment/local-development.md   # Prettier only (if not in #43)
docs/deployment/homelab-traefik-postgres.md
docs/plans/2026-06-14-phase-13-completion-journal.md  # table Prettier
```

**README updates:**

- Mark Phases 0–14 complete / MVP acceptable
- Quality gate: `231 pass` unit tests; `bun run e2e` → 10/10
- Note: `createDbRateLimiter` tests skip when `DATABASE_URL` unset; run with Postgres for full count

## Final MVP Acceptance Criteria — walk

| Criterion                            | Evidence                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| Admin login/logout                   | `admin-auth.test.ts`, E2E `mvp-queue-flow`                                         |
| Admin org/venue/board views          | `admin-organizations.test.ts`, `admin-venues.test.ts`, `admin-board-reads.test.ts` |
| Admin create/operate board           | `admin-board-create.test.ts`, `admin-board-operations.test.ts`                     |
| Admin open/close/reset               | `admin-board-operations.test.ts`, E2E                                              |
| Admin rotate QR/access               | `admin-board-access-rotation.test.ts`, E2E                                         |
| Public opens current QR URL          | `public-access.test.ts`, E2E                                                       |
| Public views board before add        | `public-board-read.test.ts`, E2E                                                   |
| Public add arbitrary valid name      | `public-add-entry.test.ts`, E2E                                                    |
| Public remove with confirmation      | `public-remove-entry.test.ts`, E2E                                                 |
| Removed entries in history only      | `public-remove-entry.test.ts`                                                      |
| Events logged                        | `public-board-events.test.ts`, E2E activity                                        |
| Recent activity collapsed by default | public-web UI (E2E verifies visibility)                                            |
| Public mutations rate-limited        | `rate-limiter.test.ts`, `public-access.test.ts`                                    |
| Expired/revoked links cannot mutate  | `public-access.test.ts`                                                            |
| Display-state ETag/304               | `display-state.test.ts`                                                            |
| Local dev deployment                 | `docker-compose.yml`, `docs/deployment/local-development.md`                       |
| Homelab app-only documented          | `docker-compose.homelab.yml`, homelab guide                                        |

**MVP acceptable:** all rows satisfied.

## Deferred post-MVP (documented, not blocking)

From security hardening journal §Phase 14 review:

- Security response headers (`X-Content-Type-Options`, etc.)
- Request body size limits
- Structured request logging

## Merge order

```text
#43 (Worker A) → merge first
#44 (Hermes docs) → rebase on main, merge second
```

## Controller checklist (Hermes)

- [ ] Worker A prompt pushed to NAS
- [ ] PR #43 opened, CI/local verify green
- [ ] PR #43 merged
- [ ] PR #44 opened with completion journal
- [ ] NAS `engineering-journal.md` append Phase 14 complete entry
- [ ] NAS README sync pointer → `origin/main` @ post-#44 SHA
