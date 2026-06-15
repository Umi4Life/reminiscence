# Security Hardening Journal — Post-Phase 8 Patches

**Date:** 2026-06-14  
**Status:** Complete  
**Based on:** External security code review of codebase as of Phase 7/8

## Summary

An out-of-band security review identified 11 findings against the Phase 7/8 API spine.
All findings were patched in a single pass on `main` between Phase 8 and Phase 9; no DB
migrations were required (all rate-limit work reuses the existing `rate_limit_buckets`
table).

Test count moved from 183 → 203 (20 new tests covering all patched surfaces).

## Findings and Patches

| #   | Finding                                                 | Severity | Files changed                                   |
| --- | ------------------------------------------------------- | -------- | ----------------------------------------------- |
| 1   | Admin login brute-force / credential stuffing           | HIGH     | `routes/admin-auth.ts`                          |
| 2   | CORS layer missing (cookie auth makes this critical)    | HIGH     | `http/cors.ts` (new), `app.ts`                  |
| 3   | `/claim` unthrottled; no IP-hash tier on add/remove     | MEDIUM   | `routes/public-access.ts`, `queue/mutations.ts` |
| 4   | User-enumeration via login timing (no dummy hash)       | MEDIUM   | `auth/admin-sessions.ts`                        |
| 5   | No Origin check on admin mutations (CSRF depth)         | MEDIUM   | `http/csrf.ts` (new), `app.ts`                  |
| 6   | `SESSION_SECRET` wired but not used (domain separation) | LOW      | `auth/admin-sessions.ts`                        |
| 7   | Placeholder secrets accepted in production              | LOW      | `packages/config/src/env.ts`                    |
| 8   | `token_preview` exposes suffix as well as prefix        | LOW      | `security/tokens.ts`                            |
| 9   | `rate_limit_buckets` table grows unbounded (no GC)      | LOW      | `rate-limit/rate-limiter.ts`, `index.ts`        |
| 10  | 500 errors swallowed silently (no log)                  | LOW      | `app.ts`                                        |
| 11  | XFF leftmost read (client-controlled behind Traefik)    | LOW      | `public/audit-metadata.ts`                      |

## Key Design Decisions

**CORS** — implemented dependency-free (no `@elysiajs/cors`). `buildAllowedOrigins`
derives a `Set<string>` from `publicAppUrl`/`adminAppUrl` at startup; `resolveCors`
echoes the origin only when it's in the set. `Vary: Origin` always set. Wildcard never
emitted.

**CSRF** — Origin check in the global `onRequest` hook, placed after preflight return so
`OPTIONS` still works. Guards `/api/admin/**` POST/PUT/PATCH/DELETE only. Requests
without an `Origin` header (e.g. server-to-server, curl) are not blocked.

**IP hashing** — `hashClientIp` extracted as a shared helper (`public/audit-metadata.ts`)
used by both the login throttle and the claim throttle. XFF now reads the **rightmost**
entry (real IP behind a single trusted Traefik hop); leftmost is client-controllable.

**Domain-separated secrets** — three secrets now serve distinct purposes:

- `SESSION_SECRET` — HMAC for admin session tokens
- `TOKEN_HMAC_SECRET` — HMAC for access credentials and public session tokens
- `RATE_LIMIT_HMAC_SECRET` — HMAC for IP/UA hashes in audit metadata and rate-limit keys

**Rate-limit GC** — `startRateLimitSweeper` runs `DELETE WHERE expires_at < now()` every
5 minutes; timer is `.unref()`-ed so it doesn't block process exit. Called from
`apps/api/src/index.ts` at startup.

**Production secret guard** — `assertStrongProductionSecrets` enforces minimum 32
characters and rejects known placeholder values when `NODE_ENV=production`. Development
and test environments are unchanged.

## Potential Conflicts with Future Phases

### Phase 9 (QR + display-state API) — Low risk

No overlap. The new endpoints are read-only or use separate session types. Ensure any
new mutation route under `/api/public/` threads `requestMeta` through so IP-hash rate
limits apply correctly.

### Phase 10–11 (Web clients) — Requires env config

The CORS allowlist is built from `PUBLIC_APP_URL` and `ADMIN_APP_URL`. Both values must
be set correctly in each deployment environment's `.env`. Browsers will reject
cross-origin API calls if the origin doesn't match — this will appear as a CORS error
in the browser console, not an API error. Verify in dev before shipping the web clients.

### Phase 12–13 (Additional admin routes) — Low risk

Any new admin mutation route under `/api/admin/**` automatically inherits the CSRF gate
in `onRequest`. No per-route changes needed. New read-only (`GET`) admin routes are not
affected.

New route factories that extend `AdminAuthRouteDeps` or `PublicAccessRouteDeps` must
include `rateLimiter: RateLimiter` in their deps — both interfaces now require it.

### Phase 14 (MVP Hardening and Review) — Resolved

Most of the Phase 14 hardening checklist items are now complete ahead of schedule:

- §11.1 CSRF defense-in-depth ✅
- §12 CORS / credentials header ✅
- §16 IP-hash rate-limit tier ✅
- §17 Unhandled 500 logging ✅
- §18.10 Placeholder secret guard ✅
- §18.12 CORS allowlist ✅

Phase 14 should review whether remaining items (security headers, request size limits,
structured logging) are needed before the MVP cutover.

## Verification

```text
bun run typecheck  →  0 errors
bun run lint       →  0 warnings
bun test           →  203 pass, 0 fail
bun run format:check  →  fails on 91 files (pre-existing CRLF on Windows checkout, not caused by these patches)
```

The `format:check` failure is a pre-existing repo-wide CRLF issue on Windows checkout.
`README.md` (untouched) is among the 91 flagged files. Git normalises line endings on
commit so this passes in CI. Fix locally with `git config core.autocrlf input` and
re-checkout, or run `prettier --write .` as a standalone commit.

---

## Addendum — 2026-06-15: Post-Phase 14 hardening pass (findings A–E)

A fresh audit of `main` after Phase 14 closed the remaining items the original journal
flagged for Phase 14 (§ "security headers, request size limits") plus three other
confirmed MEDIUM gaps. Five patches, app-code only (no env/compose changes this pass).
The QR/SVG path was reviewed and is **not** injectable — `qrcode` encodes the URL as QR
data, not markup.

| #   | Finding                                               | Files changed                                       |
| --- | ----------------------------------------------------- | --------------------------------------------------- |
| A   | No HTTP security response headers                     | `app.ts`                                            |
| B   | No request body size limit (memory-exhaustion DoS)    | `app.ts` (`serve.maxRequestBodySize`)               |
| C   | `getEvents` `?limit=` uncapped → unbounded scan       | `queue/read.ts`                                     |
| D   | No Origin/CSRF check on public cookie-auth mutations  | `http/csrf.ts`, `app.ts`                            |
| E   | Public board read / events / QR endpoints unthrottled | `routes/public-boards.ts`, `routes/qr.ts`, `app.ts` |

### Design notes

**A — Security headers.** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: geolocation=(), microphone=(), camera=()` on every response (set in
the `onRequest` hook alongside CORS). `Strict-Transport-Security` is emitted **only** when
an API base URL is `https://`, so plain-HTTP dev does not poison the browser HSTS cache.
No CSP — the API serves JSON + one SVG, and a wrong CSP would risk the web clients.

**B — Body cap.** `new Elysia({ serve: { maxRequestBodySize: 64 * 1024 } })`. All bodies
here are tiny JSON (claims, logins, display names); Bun rejects oversized requests at the
serve layer before handler dispatch.

**C — Event limit clamp.** `maxEventLimit = 100`, applied authoritatively inside
`getEvents` (`Math.min(limit, maxEventLimit)`), not just in the route parser, so the cap
holds regardless of caller. `defaultEventLimit` stays 20.

**D — Public Origin gate.** Generalized the existing admin helper rather than duplicating:
`publicOriginOf` + `isForbiddenPublicCrossOrigin` reuse the same `MUTATING_METHODS` set and
"no Origin header → allowed" contract (so `/claim` via curl / server-to-server still
works). Wired into `onRequest` next to the admin gate. Both admin and public sessions are
`SameSite=Lax` cookies, so both surfaces now carry the second layer.

**E — Public read throttles** (IP-hash via existing `hashClientIp` + `rateLimiter`):

- `GET /api/public/boards/:slug` — `board_read_ip_1m`, 60s / **60**
- `GET /api/public/boards/:slug/events` — `events_ip_1m`, 60s / **30**
- `GET /api/qr/:accessCode.svg` — `qr_ip_1m`, 60s / **30**

These limits are first-cut and generous for legitimate display polling. **Phase 15 should
tune them against real client refresh intervals** — flagged here so the numbers aren't
silently treated as final. `PublicBoardsRouteDeps` and `QrRouteDeps` now require
`rateLimiter`.

### Verification

```text
bun run typecheck          →  0 errors
bun run lint               →  0 warnings
bun test (apps/api)        →  213 pass, 0 fail  (was 204; +9 new tests)
```

New tests: public-mutation Origin helpers (`csrf.test.ts`), event-limit clamp
(`event-limit-clamp.test.ts`), security headers + HSTS-omission (`security-headers.test.ts`),
public-read 429 (`public-read-rate-limit.test.ts`). Existing public-board / qr test apps
updated to inject a permissive `rateLimiter` double.

Not exercised in this pass (no DB in the dev environment): live `curl -I` header check and
the 413 body-cap response. Header behaviour is covered by `security-headers.test.ts`; the
body cap is a Bun serve-layer guarantee. Before shipping the web clients, confirm the
public-web app issues `/claim` and entry mutations from the configured public origin so the
new gate (D) doesn't reject the real UI.
