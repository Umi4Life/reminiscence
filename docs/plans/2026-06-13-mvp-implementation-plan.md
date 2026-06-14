# Queue Reminiscence MVP Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build the MVP foundation for Queue Reminiscence: an operator-managed digital queue board with admin accounts, public QR-derived mutation access, soft-deleted queue entries, visible events, and display-state support.

**Architecture:** The API is the authoritative state owner. Public and admin SvelteKit apps are separate clients. PostgreSQL stores durable state through Drizzle migrations. Public participants never have accounts; they receive short-lived board mutation sessions from current QR/access credentials.

**Tech Stack:** Bun, Elysia.js, SvelteKit, TypeScript, PostgreSQL, Drizzle ORM, Docker, Traefik-compatible deployment.

**Inputs:**

- `docs/product/queue-reminiscence-prd.md`
- `docs/architecture/mvp-technical-architecture.md`

**Implementation Rule:** Keep the first implementation boring, explicit, and testable. Do not add participant accounts, SaaS signup, billing, MQTT publishing, queue reordering, or advanced abuse detection in MVP.

## Progress Status

_Last updated: 2026-06-14 after PR #23 merge._

| Phase                                               | Status      | Evidence   |
| --------------------------------------------------- | ----------- | ---------- |
| Phase 0: Repository Foundation                      | ✅ Complete | PR #1      |
| Phase 1: Shared Configuration and Domain Primitives | ✅ Complete | PR #1      |
| Phase 2: Database Schema                            | ✅ Complete | PR #3–#6   |
| Phase 3: API Foundation                             | ✅ Complete | PR #7      |
| Phase 4: Seed Data and Admin Auth                   | ✅ Complete | PR #8–#10  |
| Phase 5: Admin Board Management API                 | ✅ Complete | PR #12–#14 |
| Phase 6: QR/Access Credential System                | ✅ Complete | PR #16–#18 |
| Phase 7: Public Board Read and Mutation API         | ✅ Complete | PR #20–#21 |
| Phase 8: Rate Limiting and Audit Metadata           | ✅ Complete | PR #22–#23 |

Phase 4 completion notes:

- PR #8 added password helpers, opaque session token helpers, and admin RBAC helpers.
- PR #9 added idempotent local demo seed data and `db:seed`.
- PR #10 added DB-backed admin sessions plus login/logout/`/me` routes.
- Merged-main verification: `bun run check` passed with 75 tests.
- Real Postgres smoke passed for migrate → seed → login → `/api/admin/me` → logout → post-logout 401.

Phase 5 completion notes:

- PR #12 added admin organization, venue, and board read APIs.
- PR #13 added admin board create and update APIs with input validation, slug conflict handling, policy defaults, RBAC checks, and display-version behavior.
- PR #14 added admin board open, close, and reset operations with event logging, transaction-based board locking, display-version increments, and reset soft-removal of active queue entries.
- Merged-main verification: `bun run check` passed with 141 tests.
- Real Postgres smoke passed for migrate → seed → login → board list → close/open/reset → board create → board patch → database event/board-state verification.
- Completion journal: `docs/plans/2026-06-13-phase-5-completion-journal.md`.

Phase 6 completion notes:

- PR #16 added reusable opaque token helpers and refactored session-token helpers to use them.
- PR #17 added admin board access-credential rotation with transactional credential/session revocation and `access_rotated` events.
- PR #18 added public access claim/logout routes and DB-backed public mutation sessions.
- Merged-main verification: `bun run check` passed with 158 tests.
- Completion journal: `docs/plans/2026-06-14-phase-6-completion-journal.md`.

Phase 7 completion notes:

- PR #20 added public board read and events endpoints plus `boards/` module cleanup.
- PR #21 added public add/remove queue mutations with session gating and board locking.
- Merged-main verification: `bun run check` passed with 174 tests.
- Completion journal: `docs/plans/2026-06-14-phase-7-completion-journal.md`.

Phase 8 completion notes:

- PR #22 added HMAC audit metadata helpers (`buildMutationRequestMeta`) wired into public mutation routes.
- PR #23 added Postgres-backed rate limiting for public mutations via `rate_limit_buckets`.
- Merged-main verification: `bun run check` passed with 183 tests; `TODO(phase-8)` cleared.
- Completion journal: `docs/plans/2026-06-14-phase-8-completion-journal.md`.

---

## Phase 0: Repository Foundation

### Task 0.1: Create monorepo workspace skeleton

**Objective:** Establish the repository structure without implementing product behavior yet.

**Files:**

- Create: `package.json`
- Create: `bunfig.toml`
- Create: `tsconfig.base.json`
- Create: `apps/api/package.json`
- Create: `apps/public-web/package.json`
- Create: `apps/admin-web/package.json`
- Create: `packages/db/package.json`
- Create: `packages/domain/package.json`
- Create: `packages/config/package.json`
- Create: `packages/ui/package.json`
- Create: `.gitignore`
- Create: `.env.example`

**Steps:**

1. Add Bun workspace configuration in root `package.json`.
2. Add shared TypeScript base config.
3. Add package placeholders for API, public web, admin web, db, domain, config, and ui.
4. Add `.gitignore` for `node_modules`, `.svelte-kit`, `dist`, `.env`, coverage, and local database files.
5. Add `.env.example` with non-secret placeholders.

**Acceptance Criteria:**

- `bun install` succeeds.
- `bun pm ls` shows workspace packages.
- No real secrets are committed.

**Verification Command:**

```bash
bun install
bun pm ls
```

**Commit:**

```bash
git add .
git commit -m "chore: scaffold monorepo workspace"
```

---

### Task 0.2: Add shared code quality commands

**Objective:** Provide consistent format, lint, typecheck, and test commands before feature work starts.

**Files:**

- Modify: `package.json`
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.prettierignore`

**Steps:**

1. Add root scripts:
   - `format`
   - `lint`
   - `typecheck`
   - `test`
   - `check`
2. Add Prettier config.
3. Add minimal ESLint config for TypeScript.
4. Make `bun run check` run format check, lint, typecheck, and tests.

**Acceptance Criteria:**

- `bun run check` exists.
- Empty project check passes or fails only because packages are not yet implemented; if failing, document the known temporary gap in this task commit message.

**Verification Command:**

```bash
bun run check
```

**Commit:**

```bash
git add .
git commit -m "chore: add workspace quality commands"
```

---

## Phase 1: Shared Configuration and Domain Primitives

### Task 1.1: Implement environment config parser

**Objective:** Centralize runtime configuration and fail fast on missing required env values.

**Files:**

- Create: `packages/config/src/index.ts`
- Create: `packages/config/src/env.ts`
- Create: `packages/config/test/env.test.ts`
- Modify: `packages/config/package.json`

**Required Variables:**

```text
DATABASE_URL
PUBLIC_APP_URL
ADMIN_APP_URL
API_PUBLIC_BASE_URL
API_ADMIN_BASE_URL
SESSION_SECRET
TOKEN_HMAC_SECRET
RATE_LIMIT_HMAC_SECRET
TRUST_PROXY
ADMIN_SESSION_TTL_DAYS
PUBLIC_MUTATION_SESSION_TTL_HOURS
```

**Steps:**

1. Write tests for valid env parsing.
2. Write tests for missing required values.
3. Implement parser with explicit defaults only for safe development values.
4. Export typed config object.

**Acceptance Criteria:**

- Missing secrets fail at startup.
- `TRUST_PROXY` parses to boolean.
- TTL values parse to numbers.

**Verification Command:**

```bash
bun test packages/config/test/env.test.ts
```

**Commit:**

```bash
git add packages/config
git commit -m "feat: add shared environment config parser"
```

---

### Task 1.2: Implement domain validation helpers

**Objective:** Add reusable validation for names, slugs, and public messages.

**Files:**

- Create: `packages/domain/src/validation.ts`
- Create: `packages/domain/src/types.ts`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/test/validation.test.ts`
- Modify: `packages/domain/package.json`

**Validation Rules:**

- Display names are required.
- Trim leading/trailing whitespace.
- Collapse repeated internal whitespace.
- Reject whitespace-only names.
- Maximum display name length: 40 characters.
- Slugs are lowercase URL-safe strings.

**Steps:**

1. Write tests for display-name validation.
2. Write tests for slug validation.
3. Implement validation helpers.
4. Export typed result objects instead of throwing for user input validation.

**Acceptance Criteria:**

- `"  Aki  "` normalizes to `"Aki"`.
- `"Red   jacket"` normalizes to `"Red jacket"`.
- whitespace-only display names fail.
- overlength display names fail.

**Verification Command:**

```bash
bun test packages/domain/test/validation.test.ts
```

**Commit:**

```bash
git add packages/domain
git commit -m "feat: add domain validation helpers"
```

---

## Phase 2: Database Schema and Migrations

### Task 2.1: Add Drizzle and database package foundation

**Objective:** Create the database package with Drizzle config and a connection helper.

**Files:**

- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/schema.ts`
- Modify: `packages/db/package.json`
- Modify: `.env.example`

**Steps:**

1. Add Drizzle dependencies.
2. Add Postgres client dependency.
3. Create DB connection helper using `DATABASE_URL`.
4. Create empty schema export.
5. Add scripts:
   - `db:generate`
   - `db:migrate`
   - `db:studio` optional

**Acceptance Criteria:**

- Drizzle config loads.
- Database package typechecks.

**Verification Command:**

```bash
bun run --cwd packages/db db:generate
bun run typecheck
```

**Commit:**

```bash
git add packages/db .env.example
git commit -m "feat: add database package foundation"
```

---

### Task 2.2: Define core tenant and board schema

**Objective:** Add Organization, Venue, and Board tables.

**Files:**

- Modify: `packages/db/src/schema.ts`
- Create/Update: Drizzle migration files under `packages/db/drizzle/`

**Tables:**

- `organizations`
- `venues`
- `boards`

**Required Constraints:**

- organization slug unique
- venue slug unique per organization
- board slug unique per venue
- board public slug globally unique
- board status constrained to `open` or `closed`
- board has `next_sort_order` default 1
- board has `display_version` default 1

**Steps:**

1. Add schema definitions.
2. Generate migration.
3. Review generated SQL.
4. Apply migration against local/dev Postgres.

**Acceptance Criteria:**

- Migration creates tables and constraints.
- Re-running migration is safe through Drizzle migration tracking.

**Verification Command:**

```bash
bun run --cwd packages/db db:generate
bun run --cwd packages/db db:migrate
```

**Commit:**

```bash
git add packages/db
git commit -m "feat: add tenant and board schema"
```

---

### Task 2.3: Define queue, event, and audit schema

**Objective:** Add soft-deleted queue entries, public board events, and private audit metadata.

**Files:**

- Modify: `packages/db/src/schema.ts`
- Create/Update: Drizzle migration files under `packages/db/drizzle/`

**Tables:**

- `queue_entries`
- `board_events`
- `audit_metadata`

**Required Constraints and Indexes:**

- active queue queries indexed by `(board_id, status, sort_order)`
- events indexed by `(board_id, created_at desc)`
- audit metadata references event ID
- queue entry status constrained to `active` or `removed`

**Steps:**

1. Add schema definitions.
2. Generate migration.
3. Apply migration.
4. Add minimal schema-level tests if practical.

**Acceptance Criteria:**

- Removed entries remain in table.
- Events can be queried by board in reverse chronological order.

**Verification Command:**

```bash
bun run --cwd packages/db db:generate
bun run --cwd packages/db db:migrate
```

**Commit:**

```bash
git add packages/db
git commit -m "feat: add queue event and audit schema"
```

---

### Task 2.4: Define auth, access credential, and display device schema

**Objective:** Add admin sessions, memberships, public access credentials, public sessions, and display devices.

**Files:**

- Modify: `packages/db/src/schema.ts`
- Create/Update: Drizzle migration files under `packages/db/drizzle/`

**Tables:**

- `admin_users`
- `admin_sessions`
- `admin_memberships`
- `board_access_credentials`
- `public_board_sessions`
- `display_devices`
- `rate_limit_buckets`

**Required Constraints and Indexes:**

- admin email unique
- session token hashes indexed
- access credential token hash unique
- display token hash unique
- membership scoped by organization and optional venue
- rate-limit bucket lookup indexed by `(scope, bucket_key, window_start)`

**Verification Command:**

```bash
bun run --cwd packages/db db:generate
bun run --cwd packages/db db:migrate
```

**Commit:**

```bash
git add packages/db
git commit -m "feat: add auth access and display schema"
```

---

## Phase 3: API Foundation

### Task 3.1: Scaffold Elysia API app

**Objective:** Start the API service with health and readiness endpoints.

**Files:**

- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/routes/health.ts`
- Create: `apps/api/test/health.test.ts`
- Modify: `apps/api/package.json`

**Endpoints:**

```text
GET /healthz
GET /readyz
```

**Steps:**

1. Write test for `/healthz` returning `{ ok: true }`.
2. Write test for `/readyz` checking database reachability.
3. Implement Elysia app factory.
4. Implement server entrypoint.

**Acceptance Criteria:**

- API app can be imported for tests without binding a port.
- `/healthz` works without DB.
- `/readyz` fails if DB is unavailable and succeeds if DB is reachable.

**Verification Command:**

```bash
bun test apps/api/test/health.test.ts
bun run --cwd apps/api dev
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: scaffold Elysia API service"
```

---

### Task 3.2: Add API error and response conventions

**Objective:** Standardize JSON error responses before adding product endpoints.

**Files:**

- Create: `apps/api/src/http/errors.ts`
- Create: `apps/api/src/http/response.ts`
- Create: `apps/api/test/errors.test.ts`

**Response Shape:**

```json
{
  "ok": false,
  "error": {
    "code": "validation_error",
    "message": "Display name is required."
  }
}
```

**Acceptance Criteria:**

- Validation errors return 400.
- Unauthorized returns 401.
- Forbidden returns 403.
- Not found returns 404.
- Rate limited returns 429.

**Verification Command:**

```bash
bun test apps/api/test/errors.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add API error conventions"
```

---

## Phase 4: Seed Data and Admin Auth

**Status:** ✅ Complete in PR #8–#10. Merged to `main`; quality gate and real Postgres seed/auth smoke passed on merged `main`.

### Task 4.1: Add seed script for first local organization/admin

**Status:** ✅ Complete in PR #9 (`feat: add local demo seed script`).

**Objective:** Create repeatable seed data for local demo and development.

**Files:**

- Create: `packages/db/src/seed.ts`
- Modify: `packages/db/package.json`
- Modify: `.env.example`

**Seed Defaults:**

- Organization: `umi4life-demo`
- Venue: `local-demo-venue`
- Board: `chunithm-gold`
- Admin email from env: `SEED_ADMIN_EMAIL`
- Admin password from env: `SEED_ADMIN_PASSWORD`

**Acceptance Criteria:**

- Seed script is idempotent.
- Seed script does not hardcode real passwords.
- Seeded board has an active access credential only after credential task is implemented; until then, board only exists.

**Verification Command:**

```bash
bun run --cwd packages/db db:seed
```

**Commit:**

```bash
git add packages/db .env.example
git commit -m "feat: add local demo seed script"
```

---

### Task 4.2: Implement password hashing utilities

**Status:** ✅ Complete in PR #8 (`feat: add admin auth primitives and RBAC helpers`).

**Objective:** Add Argon2id password hashing and verification.

**Files:**

- Create: `apps/api/src/auth/passwords.ts`
- Create: `apps/api/test/passwords.test.ts`

**Steps:**

1. Write test: hash does not equal raw password.
2. Write test: valid password verifies.
3. Write test: invalid password fails.
4. Implement with Argon2id-compatible package.

**Acceptance Criteria:**

- Password hashes are not reversible.
- Verification works.

**Verification Command:**

```bash
bun test apps/api/test/passwords.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add admin password hashing"
```

---

### Task 4.3: Implement admin login/logout/session middleware

**Status:** ✅ Complete in PR #10 (`feat: add admin session auth routes`).

**Objective:** Provide DB-backed admin sessions.

**Files:**

- Create: `apps/api/src/auth/admin-sessions.ts`
- Create: `apps/api/src/routes/admin-auth.ts`
- Create: `apps/api/test/admin-auth.test.ts`
- Modify: `apps/api/src/app.ts`

**Endpoints:**

```text
POST /api/admin/auth/login
POST /api/admin/auth/logout
GET  /api/admin/me
```

**Acceptance Criteria:**

- Valid login creates session and sets HttpOnly cookie.
- Invalid login returns 401.
- Logout revokes session.
- Disabled admin users cannot authenticate.
- `/api/admin/me` returns current admin identity and memberships.

**Verification Command:**

```bash
bun test apps/api/test/admin-auth.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add admin session auth"
```

---

### Task 4.4: Implement admin RBAC helpers

**Status:** ✅ Complete in PR #8 (`feat: add admin auth primitives and RBAC helpers`).

**Objective:** Enforce organization/venue/board permissions in one reusable layer.

**Files:**

- Create: `apps/api/src/auth/rbac.ts`
- Create: `apps/api/test/rbac.test.ts`

**Capabilities:**

- org owner can manage organization and all venues/boards
- venue manager can manage assigned venue boards/staff
- venue staff can operate assigned venue boards

**Acceptance Criteria:**

- RBAC checks are unit-tested.
- Route handlers can call explicit helpers like `requireBoardOperator(admin, boardId)`.

**Verification Command:**

```bash
bun test apps/api/test/rbac.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add admin RBAC helpers"
```

---

## Phase 5: Admin Board Management API

**Status:** ✅ Complete. Implemented across PR #12–#14 and verified on merged `main` with unit tests, typecheck, full `bun run check`, and a real PostgreSQL-backed curl smoke test.

Completion evidence:

- PR #12 added `GET /api/admin/organizations`, `GET /api/admin/venues`, `GET /api/admin/boards`, and `GET /api/admin/boards/:boardId`.
- PR #13 added `POST /api/admin/boards` and `PATCH /api/admin/boards/:boardId`.
- PR #14 added `POST /api/admin/boards/:boardId/open`, `POST /api/admin/boards/:boardId/close`, and `POST /api/admin/boards/:boardId/reset`.
- `bun run check` passed with 141 tests after PR #14 merged.
- Real PostgreSQL smoke verified migrate, seed, admin login, board listing, open/close/reset operations, board creation, board patching, and persisted board-event/database state.

### Task 5.1: Implement admin organization and venue read endpoints

**Objective:** Allow admin UI to list accessible organizations and venues.

**Files:**

- Create: `apps/api/src/routes/admin-organizations.ts`
- Create: `apps/api/src/routes/admin-venues.ts`
- Create: `apps/api/test/admin-orgs-venues.test.ts`
- Modify: `apps/api/src/app.ts`

**Endpoints:**

```text
GET /api/admin/organizations
GET /api/admin/venues
```

**Acceptance Criteria:**

- Results are scoped to current admin memberships.
- Unauthenticated requests return 401.

**Verification Command:**

```bash
bun test apps/api/test/admin-orgs-venues.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add admin organization and venue reads"
```

---

### Task 5.2: Implement admin board CRUD

**Objective:** Allow authorized admins to create and edit boards.

**Files:**

- Create: `apps/api/src/routes/admin-boards.ts`
- Create: `apps/api/test/admin-boards.test.ts`
- Modify: `apps/api/src/app.ts`

**Endpoints:**

```text
GET    /api/admin/boards
POST   /api/admin/boards
GET    /api/admin/boards/:boardId
PATCH  /api/admin/boards/:boardId
```

**Acceptance Criteria:**

- Board public slug uniqueness is enforced.
- Board status defaults to `closed` or `open` according to seed/default decision; prefer `closed` for newly created admin boards unless the UI opens them explicitly.
- Public add/remove policies default to protected-open behavior:
  - add: `access_code_required`
  - remove: `access_code_required`
- View policy defaults to `open`.

**Verification Command:**

```bash
bun test apps/api/test/admin-boards.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add admin board CRUD"
```

---

### Task 5.3: Implement admin board operation endpoints

**Objective:** Add open, close, and reset operations with event logging.

**Files:**

- Modify: `apps/api/src/routes/admin-boards.ts`
- Create: `apps/api/test/admin-board-operations.test.ts`

**Endpoints:**

```text
POST /api/admin/boards/:boardId/open
POST /api/admin/boards/:boardId/close
POST /api/admin/boards/:boardId/reset
```

**Acceptance Criteria:**

- Open creates `board_opened` event.
- Close creates `board_closed` event.
- Reset soft-removes active entries and creates `board_reset` event.
- Each operation increments `displayVersion`.
- All operations require board operator permission.

**Verification Command:**

```bash
bun test apps/api/test/admin-board-operations.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add admin board operations"
```

---

## Phase 6: QR/Access Credential System

### Task 6.1: Implement token hashing and opaque token generation

**Objective:** Create reusable cryptographic helpers for access credentials and sessions.

**Files:**

- Create: `apps/api/src/security/tokens.ts`
- Create: `apps/api/test/tokens.test.ts`

**Rules:**

- Generate high-entropy random URL-safe tokens.
- Store HMAC-SHA256 hashes, not raw tokens.
- Token preview contains only a short non-sensitive prefix/suffix.

**Acceptance Criteria:**

- Generated tokens are URL-safe.
- Hashing is deterministic for same secret/input.
- Raw token cannot be derived from stored hash.

**Verification Command:**

```bash
bun test apps/api/test/tokens.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add opaque token helpers"
```

---

### Task 6.2: Implement admin QR/access credential rotation

**Objective:** Allow staff/admin to rotate board edit access.

**Files:**

- Create: `apps/api/src/access/board-access.ts`
- Modify: `apps/api/src/routes/admin-boards.ts`
- Create: `apps/api/test/board-access-rotation.test.ts`

**Endpoint:**

```text
POST /api/admin/boards/:boardId/access-credentials/rotate
```

**Transaction Requirements:**

- lock board row
- revoke active board credentials
- revoke public sessions tied to old credentials
- create new active credential
- create `access_rotated` board event
- increment `displayVersion`

**Acceptance Criteria:**

- Response includes raw access URL exactly once.
- Stored DB credential contains only hash and preview.
- Old credentials cannot be used after rotation.
- Existing public sessions from old credentials stop mutating after rotation.

**Verification Command:**

```bash
bun test apps/api/test/board-access-rotation.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add board access rotation"
```

---

### Task 6.3: Implement public access claim flow

**Objective:** Turn a current QR/access code into a short-lived public mutation session.

**Files:**

- Create: `apps/api/src/routes/public-access.ts`
- Create: `apps/api/src/auth/public-sessions.ts`
- Create: `apps/api/test/public-access.test.ts`
- Modify: `apps/api/src/app.ts`

**Endpoint:**

```text
POST /api/public/access/claim
```

**Acceptance Criteria:**

- Valid access code creates public board session cookie.
- Expired/revoked credential returns view-only board info if board is known.
- Invalid unknown code returns safe generic invalid response.
- Session expiry is max 8 hours or credential expiry, whichever is sooner.

**Verification Command:**

```bash
bun test apps/api/test/public-access.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add public access claim flow"
```

---

## Phase 7: Public Board Read and Mutation API

**Status:** ✅ Complete. Implemented across PR #20–#21 and verified on merged `main` with unit tests, typecheck, and full `bun run check`.

### Task 7.1: Implement public board read endpoint

**Objective:** Allow participants to view a board without accounts.

**Files:**

- Create: `apps/api/src/routes/public-boards.ts`
- Create: `apps/api/test/public-board-read.test.ts`
- Modify: `apps/api/src/app.ts`

**Endpoint:**

```text
GET /api/public/boards/:publicSlug
```

**Response Includes:**

- organization/venue context
- board name/status
- active queue entries with derived positions
- mutation access availability for current public session
- last updated/display version

**Acceptance Criteria:**

- Active entries are sorted by `sortOrder`.
- Removed entries are excluded from active queue.
- Position is derived from active order.
- Board not found returns 404.

**Verification Command:**

```bash
bun test apps/api/test/public-board-read.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add public board read endpoint"
```

---

### Task 7.2: Implement public recent activity endpoint

**Objective:** Expose safe public board events for collapsed recent activity UI.

**Files:**

- Modify: `apps/api/src/routes/public-boards.ts`
- Create: `apps/api/test/public-board-events.test.ts`

**Endpoint:**

```text
GET /api/public/boards/:publicSlug/events
```

**Acceptance Criteria:**

- Returns latest events only, default limit 20.
- Does not expose IP, user-agent, session IDs, or private audit metadata.
- Uses `publicMessage` and event timestamp.

**Verification Command:**

```bash
bun test apps/api/test/public-board-events.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add public board events endpoint"
```

---

### Task 7.3: Implement add-entry mutation

**Objective:** Allow public participants with valid mutation access to join the queue.

**Files:**

- Modify: `apps/api/src/routes/public-boards.ts`
- Create: `apps/api/src/queue/mutations.ts`
- Create: `apps/api/test/public-add-entry.test.ts`

**Endpoint:**

```text
POST /api/public/boards/:publicSlug/entries
```

**Transaction Requirements:**

- validate public session for board
- validate board is open
- validate board public add policy
- validate display name
- apply rate limits
- lock board row
- insert queue entry with `nextSortOrder`
- increment `nextSortOrder`
- create `entry_added` event
- create audit metadata
- increment `displayVersion`

**Acceptance Criteria:**

- Missing/invalid public session returns 401 or 403.
- Closed board rejects public add.
- Invalid display names return 400.
- Successful add appears in public board read.
- Event appears in public recent activity.

**Verification Command:**

```bash
bun test apps/api/test/public-add-entry.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add public queue entry mutation"
```

---

### Task 7.4: Implement remove-entry mutation

**Objective:** Allow public participants with valid mutation access to soft-remove active entries.

**Files:**

- Modify: `apps/api/src/routes/public-boards.ts`
- Modify: `apps/api/src/queue/mutations.ts`
- Create: `apps/api/test/public-remove-entry.test.ts`

**Endpoint:**

```text
POST /api/public/boards/:publicSlug/entries/:entryId/remove
```

**Transaction Requirements:**

- validate public session for board
- validate board is open
- validate board public remove policy
- apply rate limits
- soft-remove entry
- create `entry_removed` event
- create audit metadata
- increment `displayVersion`

**Acceptance Criteria:**

- Any valid public session for board can remove any active entry.
- Removed entry disappears from active queue.
- Removed entry remains in DB.
- Event appears in public recent activity.
- Removing already removed entry returns a safe error.

**Verification Command:**

```bash
bun test apps/api/test/public-remove-entry.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add public queue remove mutation"
```

---

## Phase 8: Rate Limiting and Audit Metadata

**Status:** ✅ Complete. Implemented across PR #22–#23 and verified on merged `main` with 183 tests passing and `TODO(phase-8)` cleared.

### Task 8.1: Implement HMAC audit metadata helpers

**Objective:** Store weak abuse signals privately without treating them as identity.

**Files:**

- Create: `apps/api/src/audit/audit-metadata.ts`
- Create: `apps/api/test/audit-metadata.test.ts`

**Acceptance Criteria:**

- IP hash uses HMAC secret.
- User-agent hash uses HMAC secret.
- Raw IP and user-agent are not stored in audit metadata.

**Verification Command:**

```bash
bun test apps/api/test/audit-metadata.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add private audit metadata hashing"
```

---

### Task 8.2: Implement Postgres-backed rate limiter

**Objective:** Enforce MVP public mutation rate limits without Redis.

**Files:**

- Create: `apps/api/src/rate-limit/rate-limiter.ts`
- Create: `apps/api/test/rate-limiter.test.ts`
- Modify: `apps/api/src/queue/mutations.ts`

**Initial Limits:**

```text
Per session/board:
- 3 adds / 1 minute
- 10 adds / 10 minutes
- 5 removals / 1 minute
- 20 removals / 10 minutes

Per board:
- 30 public mutation actions / 1 minute
```

**Acceptance Criteria:**

- Over-limit mutations return 429.
- Limit checks are transaction-safe enough for MVP.
- Limit keys include board and session/weak signal scope.

**Verification Command:**

```bash
bun test apps/api/test/rate-limiter.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add public mutation rate limiting"
```

---

## Phase 9: QR Rendering and Display-State API

### Task 9.1: Implement QR SVG endpoint

**Objective:** Provide QR image payloads for admin display/printing and future e-ink use.

**Files:**

- Create: `apps/api/src/routes/qr.ts`
- Create: `apps/api/test/qr.test.ts`
- Modify: `apps/api/src/app.ts`

**Endpoint:**

```text
GET /api/qr/:accessCode.svg
```

**Acceptance Criteria:**

- Returns SVG content type.
- QR encodes the public access URL, not just raw token.
- Unknown/revoked codes return 404 or safe error.

**Verification Command:**

```bash
bun test apps/api/test/qr.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add QR SVG endpoint"
```

---

### Task 9.2: Implement display-state API

**Objective:** Provide stable polling payload for e-ink/public display devices.

**Files:**

- Create: `apps/api/src/routes/display.ts`
- Create: `apps/api/src/display/display-state.ts`
- Create: `apps/api/test/display-state.test.ts`
- Modify: `apps/api/src/app.ts`

**Endpoint:**

```text
GET /api/display/:displayToken/state
```

**Acceptance Criteria:**

- Valid display token returns board state.
- Revoked display token returns 401/403.
- Queue entries include position and displayName only.
- `publicAccess` is included only if device may view it.
- Response includes `displayVersion`.
- Supports `ETag` and `If-None-Match` returning `304 Not Modified`.

**Verification Command:**

```bash
bun test apps/api/test/display-state.test.ts
```

**Commit:**

```bash
git add apps/api
git commit -m "feat: add display state API"
```

---

## Phase 10: Public Web App

### Task 10.1: Scaffold SvelteKit public app

**Objective:** Create the participant-facing SvelteKit app.

**Files:**

- Create/Modify under: `apps/public-web/`
- Create: `apps/public-web/src/routes/+layout.svelte`
- Create: `apps/public-web/src/lib/api.ts`

**Routes:**

```text
/q/[accessCode]
/b/[publicSlug]
```

**Acceptance Criteria:**

- Public app runs locally.
- API base URL comes from environment.
- Basic layout is mobile-first.

**Verification Command:**

```bash
bun run --cwd apps/public-web check
bun run --cwd apps/public-web dev
```

**Commit:**

```bash
git add apps/public-web
git commit -m "feat: scaffold public web app"
```

---

### Task 10.2: Implement QR access claim page

**Objective:** Handle `/q/:accessCode` and redirect/degrade correctly.

**Files:**

- Create: `apps/public-web/src/routes/q/[accessCode]/+page.svelte`
- Create: `apps/public-web/src/routes/q/[accessCode]/+page.ts`

**Acceptance Criteria:**

- Valid access claim redirects to `/b/:publicSlug`.
- Expired access shows PRD copy and a view-only board link where possible.
- Invalid access shows safe error.

**Verification Command:**

```bash
bun run --cwd apps/public-web check
```

**Commit:**

```bash
git add apps/public-web
git commit -m "feat: add public QR claim page"
```

---

### Task 10.3: Implement public board page

**Objective:** Show queue, add-name form, remove confirmations, and collapsed recent activity.

**Files:**

- Create: `apps/public-web/src/routes/b/[publicSlug]/+page.svelte`
- Create: `apps/public-web/src/routes/b/[publicSlug]/+page.ts`
- Create: `apps/public-web/src/lib/components/QueueList.svelte`
- Create: `apps/public-web/src/lib/components/AddNameForm.svelte`
- Create: `apps/public-web/src/lib/components/RecentActivity.svelte`

**Acceptance Criteria:**

- Shows venue/board/status.
- Shows empty queue copy from PRD.
- Shows add-name form only when mutation access is valid and board allows add.
- Shows remove buttons only when mutation access is valid and board allows remove.
- Requires confirmation before remove.
- Recent activity is collapsed by default.

**Verification Command:**

```bash
bun run --cwd apps/public-web check
```

**Commit:**

```bash
git add apps/public-web
git commit -m "feat: add public board UI"
```

---

## Phase 11: Admin Web App

### Task 11.1: Scaffold SvelteKit admin app

**Objective:** Create authenticated operator UI shell.

**Files:**

- Create/Modify under: `apps/admin-web/`
- Create: `apps/admin-web/src/routes/+layout.svelte`
- Create: `apps/admin-web/src/lib/api.ts`

**Acceptance Criteria:**

- Admin app runs locally.
- API base URL comes from environment.
- Unauthenticated state can route to login.

**Verification Command:**

```bash
bun run --cwd apps/admin-web check
bun run --cwd apps/admin-web dev
```

**Commit:**

```bash
git add apps/admin-web
git commit -m "feat: scaffold admin web app"
```

---

### Task 11.2: Implement admin login/logout and dashboard

**Objective:** Allow staff to authenticate and see accessible boards.

**Files:**

- Create: `apps/admin-web/src/routes/login/+page.svelte`
- Create: `apps/admin-web/src/routes/+page.svelte`
- Create: `apps/admin-web/src/lib/session.ts`

**Acceptance Criteria:**

- Login form authenticates against API.
- Invalid login displays safe error.
- Dashboard lists accessible boards with status and queue count.
- Logout works.

**Verification Command:**

```bash
bun run --cwd apps/admin-web check
```

**Commit:**

```bash
git add apps/admin-web
git commit -m "feat: add admin login and dashboard"
```

---

### Task 11.3: Implement admin board detail/live operation page

**Objective:** Provide staff controls for board operation.

**Files:**

- Create: `apps/admin-web/src/routes/boards/[boardId]/+page.svelte`
- Create: `apps/admin-web/src/lib/components/AdminBoardControls.svelte`
- Create: `apps/admin-web/src/lib/components/AdminEventHistory.svelte`

**Required Controls:**

- Open board
- Close board
- Reset queue
- Rotate QR link
- Copy public URL
- Copy current QR/access URL after rotation response

**Acceptance Criteria:**

- Dangerous actions require confirmation.
- Rotation displays new URL exactly after successful API response.
- Event history visible.

**Verification Command:**

```bash
bun run --cwd apps/admin-web check
```

**Commit:**

```bash
git add apps/admin-web
git commit -m "feat: add admin board operation UI"
```

---

## Phase 12: End-to-End Testing

### Task 12.1: Add Playwright setup

**Objective:** Prepare browser E2E tests for public/admin flows.

**Files:**

- Create: `playwright.config.ts`
- Create: `tests/e2e/README.md`
- Modify: `package.json`

**Acceptance Criteria:**

- Playwright can launch against locally running apps.
- Test scripts are documented.

**Verification Command:**

```bash
bun run e2e
```

**Commit:**

```bash
git add playwright.config.ts tests/e2e package.json
git commit -m "test: add Playwright e2e setup"
```

---

### Task 12.2: Add MVP critical path E2E test

**Objective:** Prove the core product loop works in browser.

**Files:**

- Create: `tests/e2e/mvp-queue-flow.spec.ts`

**Flow:**

1. Admin logs in.
2. Admin opens board.
3. Admin rotates QR/access link.
4. Participant opens `/q/:accessCode`.
5. Participant lands on board.
6. Participant adds `Aki`.
7. Participant removes `Aki` with confirmation.
8. Recent activity shows joined and removed events.
9. Admin sees event history.

**Acceptance Criteria:**

- E2E test passes against local stack.

**Verification Command:**

```bash
bun run e2e tests/e2e/mvp-queue-flow.spec.ts
```

**Commit:**

```bash
git add tests/e2e
git commit -m "test: add MVP queue flow e2e test"
```

---

## Phase 13: Docker and Homelab Deployment

### Task 13.1: Add development Docker Compose

**Objective:** Provide a self-contained local dev stack.

**Files:**

- Create: `docker-compose.dev.yml`
- Create: `Dockerfile.api`
- Create: `Dockerfile.public-web`
- Create: `Dockerfile.admin-web`
- Create: `docs/deployment/local-development.md`

**Acceptance Criteria:**

- Dev compose can start Postgres and app services.
- Docs explain migration and seed commands.

**Verification Command:**

```bash
docker compose -f docker-compose.dev.yml config
docker compose -f docker-compose.dev.yml up --build
```

**Commit:**

```bash
git add docker-compose.dev.yml Dockerfile.* docs/deployment/local-development.md
git commit -m "chore: add local development compose stack"
```

---

### Task 13.2: Add homelab app-only deployment docs

**Objective:** Document deployment with externally managed Postgres and Traefik.

**Files:**

- Create: `docker-compose.app.yml`
- Create: `docs/deployment/homelab-traefik-postgres.md`

**Docs Must Include:**

- app-only compose services
- required external Docker network, if used
- Traefik labels example
- external `DATABASE_URL`
- dedicated DB/user/schema expectation
- cookie/proxy requirement with `TRUST_PROXY=true`
- backup responsibility belongs to shared Postgres ops

**Acceptance Criteria:**

- Homelab mode does not start Postgres.
- Homelab mode does not start Traefik.
- Docs explicitly state external Postgres/Traefik are supported first-class.

**Verification Command:**

```bash
docker compose -f docker-compose.app.yml config
```

**Commit:**

```bash
git add docker-compose.app.yml docs/deployment/homelab-traefik-postgres.md
git commit -m "docs: add homelab app-only deployment guide"
```

---

## Phase 14: MVP Hardening and Review

### Task 14.1: Run full quality gate

**Objective:** Verify the implementation as a whole.

**Files:**

- Modify only if fixing failures.

**Commands:**

```bash
bun install
bun run format
bun run lint
bun run typecheck
bun test
bun run e2e
```

**Acceptance Criteria:**

- All checks pass.
- Any skipped test has a documented reason and issue/TODO.

**Commit:**

```bash
git add .
git commit -m "chore: pass MVP quality gate"
```

---

### Task 14.2: Write MVP operator README

**Objective:** Provide a concise operator/developer landing page.

**Files:**

- Create: `README.md`

**README Must Include:**

- product summary
- architecture summary
- local dev quickstart
- homelab deployment pointer
- seed admin instructions
- test commands
- current MVP scope

**Acceptance Criteria:**

- New contributor can run local dev from README.
- Operator can find homelab deployment docs.

**Verification Command:**

```bash
sed -n '1,200p' README.md
```

**Commit:**

```bash
git add README.md
git commit -m "docs: add project README"
```

---

## Final MVP Acceptance Criteria

MVP is acceptable when all of the following are true:

- Admin can log in and log out.
- Admin can view accessible organizations/venues/boards.
- Admin can create or operate a board.
- Admin can open/close/reset board.
- Admin can rotate QR/access credential.
- Public participant can open current QR/access URL.
- Public participant can view board before adding a name.
- Public participant can add arbitrary valid display name.
- Public participant can remove any active queue entry with confirmation.
- Removed entries disappear from active queue but remain in history.
- Add/remove/reset/open/close/access-rotation events are logged.
- Public recent activity is visible but collapsed by default.
- Public mutation actions are rate-limited.
- Expired/revoked access links cannot mutate.
- Display-state endpoint returns stable payload and supports ETag/304.
- Local dev deployment works.
- Homelab app-only deployment shape is documented.

## Handoff Notes for Sky Feather

Start with Phase 0 and do not skip quality gates. Keep commits small. If a task reveals an architecture mismatch, update `docs/architecture/mvp-technical-architecture.md` before continuing.

Implementation priorities:

1. Make the product spine work end-to-end.
2. Keep product rules in the API.
3. Preserve no-participant-account behavior.
4. Verify with tests before UI polish.
5. Treat external Postgres and external Traefik support as a first-class requirement, not an afterthought.

Do not build future features during MVP unless the architecture document explicitly requires them.
