# Phase 6 Completion Journal — QR/Access Credential System

**Date:** 2026-06-14  
**Status:** Complete  
**Evidence:** PR #16, PR #17, PR #18, merged-main checks

## Summary

Phase 6 delivered the QR/access credential foundation for Queue Reminiscence. The work was split into three reviewable PRs:

| PR  | Scope                        | Result                                              |
| --- | ---------------------------- | --------------------------------------------------- |
| #16 | Opaque token helpers         | Reusable generation, HMAC hashing, and preview APIs |
| #17 | Admin access rotation        | Board credential rotation with session revocation   |
| #18 | Public access claim + logout | QR/access-code claim flow and public session cookie |

The merged result lets operators rotate board edit access and lets participants claim short-lived public mutation sessions from current credentials.

## Delivered API Surface

### Admin access rotation

```text
POST /api/admin/boards/:boardId/access-credentials/rotate
```

### Public access claim

```text
POST /api/public/access/claim
POST /api/public/access/logout
```

## Behavior Implemented

- Shared opaque token helpers live in `apps/api/src/security/tokens.ts`; session-token helpers now delegate to them.
- Access credentials store HMAC-SHA256 hashes and short previews only; raw tokens are returned once at rotation time.
- Admin rotation runs in a transaction: lock board row, revoke active credentials, revoke public sessions tied to old credentials, create a new active credential, emit `access_rotated`, increment `displayVersion`.
- Public claim validates the current access code, creates a `qr_public_session` cookie, and caps session expiry at 8 hours or credential expiry, whichever is sooner.
- Expired or revoked credentials return view-only board info when the board is known; unknown codes return a safe generic invalid response.
- Public logout revokes the active session token and clears the cookie.

## Verification

### Unit and repository checks

After PR #18 merged, merged `main` passed:

```text
bun run check
```

Observed result:

```text
158 pass
0 fail
```

New test files added in this phase:

- `apps/api/test/tokens.test.ts`
- `apps/api/test/admin-board-access-rotation.test.ts`
- `apps/api/test/public-access.test.ts`

## Operational Notes

- PR #18 stacked on PR #16; after #16 and #17 merged, #18 needed a small `app.ts` wiring conflict resolution to keep both `boardAccessService` and `publicSessionService`.
- The repo uses Bun `1.2.23`; this remains important on the current Hermes host because newer Bun builds can require CPU features unavailable on this VM.
- For future real-PostgreSQL smoke tests, reuse or stop/pause the local Postgres container rather than deleting it, unless a clean database is explicitly needed.

## Next Phase

Phase 7 is the public board read and mutation API. It should start from the Phase 6 access-session foundation and add:

- public board read by `publicSlug`
- public recent activity read
- add/remove queue entry mutations gated by board policy and the current public session
- event visibility and soft-deletion behavior for public responses
