# Phase 8 Completion Journal — Rate Limiting and Audit Metadata

**Date:** 2026-06-14  
**Status:** Complete  
**Evidence:** PR #22, PR #23, merged-main checks

## Summary

Phase 8 closed the deferred abuse-signal and rate-limit hooks left in Phase 7 mutations. Work was split into two parallel PRs with no stack dependency:

| PR  | Scope                 | Worker / lane     | Result                                          |
| --- | --------------------- | ----------------- | ----------------------------------------------- |
| #22 | HMAC audit metadata   | `hermes-cursor-1` | `buildMutationRequestMeta()` + route wiring     |
| #23 | Postgres rate limiter | `hermes-cursor-2` | `createDbRateLimiter()` + mutations integration |

## Delivered Modules

- `apps/api/src/public/audit-metadata.ts` — `buildMutationRequestMeta(request, config)` hashes IP (when `trustProxy`) and user-agent via `RATE_LIMIT_HMAC_SECRET`; raw values never stored.
- `apps/api/src/rate-limit/rate-limiter.ts` — upsert-based bucket counter on `rate_limit_buckets` table (no Redis).
- `apps/api/src/queue/mutations.ts` — rate checks before board transaction; audit meta persisted on mutation events.

## Rate Limits (MVP)

```text
Per session/board:
- 3 adds / 1 minute
- 10 adds / 10 minutes
- 5 removals / 1 minute
- 20 removals / 10 minutes

Per board:
- 30 public mutation actions / 1 minute
```

Over-limit mutations return HTTP 429 via `rateLimitedError()`.

## Verification

After PR #23 merged (`main` @ `67c60c3`):

```text
bun run check
grep -r "TODO(phase-8)" apps/api/src/
```

Observed result:

```text
183 pass
0 fail
TODO(phase-8) cleared
```

New test files:

- `apps/api/test/audit-metadata.test.ts` (8 unit tests, no DB)
- `apps/api/test/rate-limiter.test.ts` (integration; auto-skips without `DATABASE_URL`)

## Operational Notes

- Worker A placed audit helper under `public/` (not `audit/`) — matches existing `public/` service grouping from Phase 7.
- Hermes integrator fixed Bun test matcher typings (`.not.toBeNull()` → `toBe(null)` pattern) before PR #22 merge.
- First Worker A dispatch used broken shell expansion (`$(cat prompt)` mangled prompt); redispatch via here-doc fixed Worker B path.
- Worker wrappers on fleet already route `cursor-headless` → `claude --model claude-sonnet-4-6`; benchmark pings confirmed Claude path on all three workers (2026-06-14 ~11:31 UTC).
- Rate-limiter integration tests require real Postgres; unit path passes without DB.

## Next Phase

Phase 9 — QR SVG endpoint and display-state API (`GET /api/qr/:accessCode.svg`, `GET /api/display/:displayToken/state` with ETag/304 support).
