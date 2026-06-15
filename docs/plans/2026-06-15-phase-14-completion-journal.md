# Phase 14 Completion Journal — MVP Hardening and Review

**Date:** 2026-06-15  
**Status:** Complete  
**Evidence:** PR #43 (E2E + compose hardening), PR #44 (docs closure)

## Summary

Phase 14 closed the MVP implementation plan. Work verified the full quality gate, fixed an E2E CSRF/CORS origin mismatch when dev `.env` uses LAN IPs, corrected compose healthcheck YAML quoting, and walked the Final MVP Acceptance Criteria checklist.

| PR  | Scope                         | Lane              | Result                                            |
| --- | ----------------------------- | ----------------- | ------------------------------------------------- |
| #43 | E2E origin fix + compose YAML | Worker A          | `playwright.config.ts`, `docker-compose*.yml`     |
| #44 | MVP closure docs              | Hermes controller | README, plan marker, this journal, deployment fmt |

## Root Cause — E2E Admin Login Failure

**Symptom:** `mvp-queue-flow` failed at "admin logs in" with "Cross-origin request rejected."

**Cause:** Root `.env` had `ADMIN_APP_URL=http://192.168.1.213:3001` while Playwright browsers hit `http://localhost:3001`. API CSRF middleware compares `Origin` header to configured `ADMIN_APP_URL`.

**Fix:** `playwright.config.ts` forces localhost URL env for all `webServer` processes regardless of dev `.env`.

## Verification

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun run check    # format ✅ lint ✅ typecheck ✅ 231 pass
bun run e2e      # 10/10 pass
```

### Unit test note

`createDbRateLimiter` integration tests (6 cases) run when `DATABASE_URL` is set; otherwise the suite emits a single skip placeholder. With Postgres on `:5432`, all 231 tests pass.

## Final MVP Acceptance Criteria

| Criterion                            | Status | Evidence                              |
| ------------------------------------ | ------ | ------------------------------------- |
| Admin login/logout                   | ✅     | `admin-auth.test.ts`, E2E             |
| Admin org/venue/board views          | ✅     | admin read route tests                |
| Admin create/operate board           | ✅     | create + operations tests             |
| Admin open/close/reset               | ✅     | operations tests, E2E                 |
| Admin rotate QR/access               | ✅     | access rotation tests, E2E            |
| Public opens current QR URL          | ✅     | `public-access.test.ts`, E2E          |
| Public views board before add        | ✅     | `public-board-read.test.ts`           |
| Public add valid display name        | ✅     | `public-add-entry.test.ts`, E2E       |
| Public remove with confirmation      | ✅     | `public-remove-entry.test.ts`, E2E    |
| Removed entries in history only      | ✅     | remove + read tests                   |
| Mutation events logged               | ✅     | events tests, E2E activity            |
| Recent activity collapsed by default | ✅     | public-web UI, E2E                    |
| Public mutations rate-limited        | ✅     | `rate-limiter.test.ts`                |
| Expired/revoked links cannot mutate  | ✅     | `public-access.test.ts`               |
| Display-state ETag/304               | ✅     | `display-state.test.ts`               |
| Local dev deployment works           | ✅     | `docker-compose.yml`, local dev guide |
| Homelab app-only documented          | ✅     | homelab compose + guide               |

**MVP acceptable:** all criteria satisfied.

## Deferred Post-MVP

Per `docs/plans/2026-06-14-security-hardening-journal.md`:

- Security response headers
- Request body size limits
- Structured request logging

## Next

MVP implementation plan complete. Future work is product iteration beyond MVP scope (see PRD out-of-scope list).
