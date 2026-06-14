# Phase 9 Completion Journal — QR Rendering and Display-State API

**Date:** 2026-06-14  
**Status:** Complete  
**Evidence:** PR #25, PR #26, merged-main checks

## Summary

Phase 9 delivered QR SVG rendering for public access URLs and a polling-friendly display-state API for venue displays. Work was split into two parallel PRs with a minor `app.ts` / `board-access.ts` overlap resolved at merge time:

| PR  | Scope             | Worker / lane     | Result                                                   |
| --- | ----------------- | ----------------- | -------------------------------------------------------- |
| #25 | QR SVG endpoint   | `hermes-cursor-1` | `GET /api/qr/:accessCode.svg`, `access-url.ts`, `qrcode` |
| #26 | Display-state API | `hermes-cursor-2` | `GET /api/display/:displayToken/state`, ETag/304 support |

## Delivered API Surface

```text
GET /api/qr/:accessCode.svg
GET /api/display/:displayToken/state
```

## Behavior Implemented

- QR SVG endpoint hashes the access code, looks up an active credential, and returns `image/svg+xml` encoding the full public access URL (not just the raw token). Unknown or revoked codes return 404.
- Display-state endpoint resolves a display device token, returns board queue state with derived positions and display names only, and includes `publicAccess` (URL + `qrSvgUrl`) when the device may view credentials.
- Responses carry `displayVersion` and an `ETag` of the form `board-display-N`; matching `If-None-Match` returns `304 Not Modified`.
- Migration `0003` adds `access_code_ciphertext` on `board_access_credentials` for reversible credential display in admin flows (`credential-ciphertext.ts`).

## Verification

After PR #25 and #26 merged (`main` @ `e21eecc`):

```text
bun run check
```

Observed result:

```text
220 pass
0 fail
```

Postgres smoke (`qr-smoke-p9` on :5433):

```text
migrate → seed → admin login → rotate credential → QR SVG 200 (image/svg+xml)
SQL insert display_devices → display state 200 with publicAccess.url + qrSvgUrl
ETag board-display-N → 304 on If-None-Match
```

New test files in this phase:

- `apps/api/test/qr.test.ts`
- `apps/api/test/display-state.test.ts`
- `apps/api/test/credential-ciphertext.test.ts`

## Operational Notes

- PR #26 merged before PR #25; second merge required rebasing `phase9-qr-svg` onto updated `main` and keeping both `.use()` registrations in `app.ts`.
- `cursor-headless` wrapper fix (`--dangerously-skip-permissions`) was required before Worker A/B dispatch succeeded on Claude Sonnet 4.6.
- Security hardening patches (11 findings, journal `docs/plans/2026-06-14-security-hardening-journal.md`) landed on `main` between Phase 8 docs and Phase 9 feature PRs; merged-main test count reflects both.

## Next Phase

Phase 10 — Public Web App (SvelteKit participant-facing client consuming the public board and access APIs).
