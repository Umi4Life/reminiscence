# Phase 10 Completion Journal — Public Web App

**Date:** 2026-06-14  
**Status:** Complete  
**Evidence:** PR #28, PR #29, merged-main checks

## Summary

Phase 10 delivered the participant-facing SvelteKit app at `apps/public-web/`. Work was split into two parallel PRs: scaffold + QR claim first, then board UI stacked on the scaffold branch.

| PR  | Scope             | Worker / lane     | Result                                                                  |
| --- | ----------------- | ----------------- | ----------------------------------------------------------------------- |
| #28 | Tasks 10.1 + 10.2 | `hermes-cursor-1` | SvelteKit scaffold, `api.ts`, `/q/[accessCode]` claim + redirect        |
| #29 | Task 10.3         | `hermes-cursor-2` | `/b/[publicSlug]` board view, add/remove, confirm dialog, activity list |

## Delivered Routes

```text
/q/[accessCode]   → claim access, redirect to board or show expired/invalid copy
/b/[publicSlug]   → board read, queue list, add/remove with confirm, recent events
```

## Behavior Implemented

- SvelteKit public app on port **3000** with mobile-first layout and shared `api.ts` using `credentials: 'include'` for cross-origin API cookies.
- Claim page calls `POST /api/public/access/claim`; valid codes redirect to `/b/:publicSlug`; expired/revoked codes show PRD copy with optional view-only board link.
- Board page loads queue entries, mutation access flags, and recent events; add/remove mutations respect `canAdd` / `canRemove` gating from the API.
- Shared components: `QueueList`, `AddNameForm`, `ConfirmDialog`, `RecentActivity`.
- `PUBLIC_API_BASE_URL` env drives API base URL (default `http://localhost:3002/api`).

## Verification

After PR #28 and #29 merged (`main` @ `b610cac`):

```text
bun run check
```

Observed result:

```text
220 pass
0 fail
```

Cross-service smoke (Hermes integrator, post-merge `main`):

```text
Postgres (qr-smoke-p9 :5433) → migrate → seed
API :3002 + public-web :3000 with PUBLIC_APP_URL=http://localhost:3000
Admin login → rotate credential → open board
/q/<accessCode> → 302 redirect /b/<publicSlug>
POST claim + add entry → 200; board page HTTP 200
```

## Operational Notes

- Phase 10 client must match security hardening from `docs/plans/2026-06-14-security-hardening-journal.md`: CORS allowlist requires exact `PUBLIC_APP_URL`; claim IP throttle discourages auto-retry loops; mutation session is HttpOnly on the API origin.
- Worker dispatch used `cursor-headless` (Claude Sonnet 4.6 via subscription CLI), not `cursor-agent` / Composer.
- Phase 10 polling fix (`worker-dispatch.sh` / `worker-poll.sh`) landed on Hermes after this phase; future phases should poll fork SHA / PR / heartbeat, not Claude stdout buffer size.

## Next Phase

Phase 11 — Admin Web App (SvelteKit operator client at `apps/admin-web/`).
