# Plan: Cursor pagination for all admin list endpoints

**Status:** Ready to implement
**Estimated effort:** ~1.5–2 focused days
**Author handoff:** This plan is self-contained. You should not need prior conversation context.

---

## 1. Goal & scope

Add keyset (cursor) pagination to every "list" endpoint and its frontend client, standardizing on one shared response envelope and query schema.

### In scope (4 endpoints, currently unpaginated)

| Endpoint | Route file | Service fn |
|---|---|---|
| `GET /api/admin/organizations` | `apps/api/src/routes/admin-organizations.ts` | `listOrganizations` in `apps/api/src/admin/board-management.ts` |
| `GET /api/admin/venues` | `apps/api/src/routes/admin-venues.ts` | `listVenues` in `apps/api/src/admin/board-management.ts` |
| `GET /api/admin/boards` | `apps/api/src/routes/admin-boards.ts` | `listBoards` in `apps/api/src/admin/board-management.ts` |
| `GET /api/admin/admins` | `apps/api/src/routes/admin-users.ts` | `listAdmins` in `apps/api/src/admin/admin-management.ts` |

### Already paginated — consolidate onto the shared helper (lower priority, see §8)

- `GET /api/admin/audit-events` — already cursor-style (`before` + `limit`). Reference implementation: `apps/api/src/admin/admin-audit-log.ts`.
- `GET /api/public/boards/:publicSlug/events` — has bare `limit` only. Touching this also changes `apps/public-web` — treat as a **separate, optional** follow-up.

### Key finding (verified, do not re-investigate)

The list services **already filter RBAC inside SQL** (`.where(or(...accessConditions))` with `inArray`), e.g. `board-management.ts:285-289` and `admin-management.ts:157-179`. Pagination is therefore **purely additive**: AND a cursor predicate, add `ORDER BY` + `LIMIT`. No RBAC logic moves out of memory into SQL — it's already there.

---

## 2. Design decisions

### 2a. Keyset cursor, not offset

Offset paging races against live board/queue mutations (rows shift between pages). Use a keyset cursor on a stable, monotonic-ish sort key.

**Sort key:** `(createdAt DESC, id DESC)`. The `id` tiebreaker is mandatory — `createdAt` alone collides (the existing audit-log `lt(createdAt, before)` has a latent boundary bug where same-millisecond rows can be skipped or duplicated; do **not** copy that lossy single-column approach for the new endpoints).

**Cursor format:** opaque base64url of `"<createdAtISO>|<id>"`. Opaque = clients treat it as a token; we can change the encoding later. Provide encode/decode helpers (§3a).

**WHERE predicate** for "older than cursor" with `(createdAt, id)` descending:
```ts
or(
  lt(table.createdAt, cursor.createdAt),
  and(eq(table.createdAt, cursor.createdAt), lt(table.id, cursor.id)),
)
```

**Has-more detection:** fetch `limit + 1` rows. If you get `limit + 1`, drop the extra and emit `nextCursor` from the last *kept* row. Otherwise `nextCursor = null`.

### 2b. Standardized response shape

Today each endpoint returns a named key (`{ boards: [...] }`, `{ organizations: [...] }`). **Change all four to the uniform shape:**

```ts
{ items: T[], nextCursor: string | null }
```

This is the deliberate breaking change. It's a refactor — the frontend is updated in the same pass, and Eden Treaty's end-to-end types will surface every consuming call site as a compile error (that's your worklist, see §6).

> If the team prefers to preserve the named keys to minimize churn, the fallback is `{ <key>: T[], nextCursor: string | null }`. Pick one **before** starting and apply it uniformly. This plan assumes `items`.

### 2c. Query schema

One shared query model: `limit` (1–100, default 20) + optional opaque `cursor`.

---

## 3. Implementation steps

Work in this order. Each step compiles and is independently shippable.

### Step 0 — Decide the response-key convention (§2b). 5 min.

### 3a. Shared scaffolding (backend) — ~1.5h

**File: `apps/api/src/http/pagination.ts` (new)**

```ts
import { t, type TSchema } from "elysia";

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/** Query string for any paginated list route. Register in models.ts. */
export const PaginationQuery = t.Object({
  limit: t.Optional(
    t.Numeric({ minimum: 1, maximum: MAX_PAGE_LIMIT, description: "Items per page (1–100, default 20)." }),
  ),
  cursor: t.Optional(t.String({ description: "Opaque pagination cursor from a prior response." })),
});

/** Response data shape — wrap with `success(Paginated(ItemSchema))` at the route. */
export const Paginated = <T extends TSchema>(item: T) =>
  t.Object({ items: t.Array(item), nextCursor: t.Nullable(t.String()) });

export interface PageCursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(c: PageCursor): string {
  return Buffer.from(`${c.createdAt.toISOString()}|${c.id}`, "utf8").toString("base64url");
}

/** Returns null for malformed/absent input — callers treat null as "first page". */
export function decodeCursor(raw: string | undefined): PageCursor | null {
  if (!raw) return null;
  try {
    const [iso, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
    const ts = Date.parse(iso);
    if (Number.isNaN(ts) || !id) return null;
    return { createdAt: new Date(ts), id };
  } catch {
    return null;
  }
}

/** Service-layer page request + result helpers. */
export interface PageRequest {
  limit: number;
  cursor: PageCursor | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Given `limit+1` fetched rows, trim to `limit` and compute nextCursor.
 * `toCursor` extracts the keyset from a row.
 */
export function buildPage<T>(rows: T[], limit: number, toCursor: (row: T) => PageCursor): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(toCursor(last)) : null,
  };
}
```

> **Runtime note:** `Buffer` is available under Bun (this repo's runtime). If a unit test runs in a non-Node context, swap to a small base64url polyfill — unlikely needed here.

**File: `apps/api/src/http/models.ts`** — register the query model so routes can reference it by name:
```ts
// add to the .model({ ... }) call, under "Path params & query strings":
PaginationQuery: paginationSchemas.PaginationQuery,
```
(import `* as paginationSchemas from "./pagination"` or add `PaginationQuery` to the existing `schemas` barrel — match the file's existing import style.)

**Re-export for consumers:** ensure `Paginated`, `PaginationQuery`, `Page`, `PageRequest` are reachable via `apps/api/src/api-types.ts` if the frontend needs the types (it needs `Page`/the item types — see §6).

### 3b. Convert `listOrganizations` (the template) — ~1h

This is the simplest (no joins). Get it fully working end-to-end first; it becomes the copy template.

**Service — `apps/api/src/admin/board-management.ts`:**

Change the interface signature:
```ts
listOrganizations(rbac: AdminRbacContext, page: PageRequest): Promise<Page<OrganizationSummary>>;
```

Rewrite the body (both the super-admin and scoped branches) to add the cursor predicate, ordering, and `limit + 1`:
```ts
async listOrganizations(rbac, page): Promise<Page<OrganizationSummary>> {
  const cursorCond = page.cursor
    ? or(
        lt(organizations.createdAt, page.cursor.createdAt),
        and(eq(organizations.createdAt, page.cursor.createdAt), lt(organizations.id, page.cursor.id)),
      )
    : undefined;

  const scopeCond = rbac.isSuperAdmin
    ? undefined
    : (() => {
        const ids = getAccessibleOrganizationIds(rbac.memberships);
        return ids.length === 0 ? "EMPTY" : inArray(organizations.id, ids);
      })();

  if (scopeCond === "EMPTY") return { items: [], nextCursor: null };

  const rows = await db
    .select()
    .from(organizations)
    .where(and(scopeCond, cursorCond)) // `and(undefined, x)` is fine in Drizzle
    .orderBy(desc(organizations.createdAt), desc(organizations.id))
    .limit(page.limit + 1);

  return buildPage(rows.map(toOrganizationSummary), page.limit, (o) => ({
    createdAt: o.createdAt,
    id: o.id,
  }));
}
```
Add imports: `and, desc, lt, or` from `drizzle-orm` (some already imported), and `buildPage, type Page, type PageRequest` from `../http/pagination`.

> The `"EMPTY"` sentinel keeps the early-return semantics the current code has (return empty when the admin has no accessible orgs). Use whatever local style is cleanest — a plain `if` branch is fine too.

**Route — `apps/api/src/routes/admin-organizations.ts`:**

- Add `query: "PaginationQuery"` to the route options.
- Parse the page request and call the service:
```ts
const page = {
  limit: query.limit ?? DEFAULT_PAGE_LIMIT,
  cursor: decodeCursor(query.cursor),
};
const result = await deps.boardManagementService.listOrganizations(rbac, page);
return apiSuccess(result); // result is already { items, nextCursor }
```
- Change the response schema:
```ts
response: {
  200: success(Paginated(OrganizationSummary)),
  401: "ErrorResponse",
},
```
Import `Paginated`, `decodeCursor`, `DEFAULT_PAGE_LIMIT` from `../http/pagination`.

**Verify:** `bun run typecheck` (or the repo's check script) for the API package, then hit the endpoint and confirm `{ ok: true, data: { items, nextCursor } }`.

### 3c. Convert `listVenues` and `listBoards` — ~1h total

Identical pattern. Notes:
- **Venues:** keyset columns are `venues.createdAt`, `venues.id`. Scope conditions already exist (`accessConditions`); AND the cursor predicate into the same `where`.
- **Boards:** the query joins `venues`. Order by `boards.createdAt DESC, boards.id DESC` (the board is the row identity). Cursor columns must reference `boards.*`, not `venues.*`.

### 3d. Convert `listAdmins` (the spicy one) — ~1h

`apps/api/src/admin/admin-management.ts:130`. Two wrinkles, both mechanical:

1. **Two branches** (super-admin at line ~131, scoped at line ~157) both need paging.
2. **Memberships are loaded then associated in memory.** Reorder so memberships are fetched only for the **page** of admins:
   - **Scoped branch:** it currently fetches `scopeMemberships` first to derive `adminUserIds`. Keep that (it defines visibility), but apply the cursor predicate + `ORDER BY adminUsers.createdAt DESC, adminUsers.id DESC` + `LIMIT page.limit + 1` to the **`adminUsers`** query. Then `buildPage` on the admin rows, and filter `scopeMemberships` to the page's admin ids when building summaries.
   - **Super-admin branch:** currently `SELECT * FROM adminUsers` + `SELECT * FROM adminMemberships` (both unbounded — this is the one place that truly fetches everything). Page the `adminUsers` query the same way, then fetch memberships for just the page: `where(inArray(adminMemberships.adminUserId, pageAdminIds))`.

Keyset columns: `adminUsers.createdAt`, `adminUsers.id`. The existing `.orderBy(adminUsers.createdAt)` (ascending) must change to `desc(...)` for both columns to match the cursor direction.

Return `Page<AdminUserSummary>`; the route's `ListAdminsResult` union (`{ status: "ok"; admins }` / `{ status: "forbidden" }`) should become `{ status: "ok"; page: Page<AdminUserSummary> }` / `{ status: "forbidden" }`. Update `apps/api/src/routes/admin-users.ts` accordingly: response schema `success(Paginated(AdminUserSummary))`, add `query: "PaginationQuery"`.

### 3e. DB indexes — ~1h

Keyset pagination needs an index matching the sort, or every page does a full sort. Add a composite index `(created_at DESC, id DESC)` per table, plus composites covering the scoped filters where they exist.

This repo uses Drizzle. Add indexes in the schema definitions (`@queue-reminiscence/db/schema`) and generate a migration:
```
# from the db package (confirm exact scripts in its package.json)
bun run db:generate   # drizzle-kit generate
bun run db:migrate    # apply to local dev DB
```
Indexes to add:
- `organizations (created_at, id)`
- `venues (created_at, id)` and `venues (organization_id, created_at, id)`
- `boards (created_at, id)` — and consider `(venue_id, created_at, id)` since boards filter by venue.
- `admin_users (created_at, id)`

> Sort direction in the index: Postgres can scan a `(created_at, id)` btree backwards for `DESC, DESC`, so a plain composite usually suffices. Only specify explicit `.desc()` in the index if `EXPLAIN` shows a sort node. Don't over-engineer before measuring.

**Reminder:** e2e/integration tests target the dedicated DB on **port 5433**, never the dev DB. Run migrations against both before testing.

### 3f. Shared types export — confirm

The frontend imports item types from `@queue-reminiscence/api/types` (see `apps/admin-web/src/lib/api.ts:1-12`). Ensure `Page<T>` / `nextCursor` shape is derivable there. Because the route response schemas drive Eden Treaty's types, the `{ items, nextCursor }` shape flows automatically — but export the `Page` interface too for the client function signatures.

---

## 4. Frontend changes (admin-web) — ~0.5 day

### 4a. API client — `apps/admin-web/src/lib/api.ts`

Each list fn currently returns `{ <key>: T[] }`. Change to accept a page arg and return the page:

```ts
export interface PageArgs { limit?: number; cursor?: string }

export async function listOrganizations(
  args: PageArgs = {},
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ items: OrganizationSummary[]; nextCursor: string | null }> {
  const query: Record<string, string | number> = {};
  if (args.limit !== undefined) query.limit = args.limit;
  if (args.cursor !== undefined) query.cursor = args.cursor;
  return unwrap(
    client(fetchFn).api.admin.organizations.get(
      Object.keys(query).length ? { query } : {},
    ),
  );
}
```
Apply the same to `listVenues`, `listBoards`, `listAdmins`. Note the **argument order change** (page args before `fetchFn`) — every caller passing `fetch` positionally must update. The `unwrap<T>` helper already returns `data.data`, so it now returns `{ items, nextCursor }` directly.

### 4b. Page loaders & components

5 loaders consume these (`apps/admin-web/src/routes/+page.ts`, `organizations/+page.ts`, `venues/+page.ts`, `admins/+page.ts`; root loads boards+orgs). Minimal viable approach:

- **Loader:** fetch the first page only (no cursor). Return `{ items, nextCursor }` instead of the old named array.
- **Component:** render `items`; add a **"Load more"** button shown when `nextCursor !== null`. On click, call the client with `{ cursor: nextCursor }`, append `items`, update `nextCursor`. Keep it client-side state — no need to thread the cursor through the URL for v1.
- Update the `.svelte` components that read `data.boards` / `data.organizations` / etc. to read `data.items` (or the chosen key).

> **Spicy (skip for v1):** cursor in the URL querystring for bookmarkable/shareable pages and SSR. Adds router plumbing for little near-term value given list sizes. Revisit if lists grow large.

---

## 5. Tests

### Backend integration (per converted endpoint)
- First page returns ≤ `limit` items and a `nextCursor` when more exist.
- Following `nextCursor` returns the next slice with **no overlap and no gaps** (seed > `limit` rows with **identical `createdAt`** to prove the `id` tiebreaker works — this is the bug the audit-log pattern has).
- Last page returns `nextCursor: null`.
- `limit` clamping: `limit=0` / `limit=101` rejected by the schema (400); absent → default 20.
- Malformed `cursor` → treated as first page (or 400 — pick one; `decodeCursor` returning null = "first page" is the gentler choice; document it).
- **RBAC still scopes:** a venue_manager paging boards never sees out-of-scope boards across page boundaries.
- `admins`: super-admin branch and scoped branch both paginate; membership arrays are correct for the returned page only.

### Frontend
- "Load more" appends and hides when `nextCursor` is null.

### E2E (Playwright)
- Add/extend a spec for one list (boards) doing load-more. Remember: dedicated DB **port 5433**.

---

## 6. Execution worklist (use the compiler)

After changing each route's response schema, run the API typecheck, then the admin-web typecheck. **Eden Treaty propagates the response type across the network boundary**, so every stale `.boards` / `.organizations` access in the frontend becomes a compile error. Let that error list be your checklist — fix until green. Suggested commit boundaries:

1. `feat(api): shared pagination helpers + query model` (§3a)
2. `feat: paginate organizations end-to-end` (§3b + its frontend)
3. `feat: paginate venues + boards` (§3c + frontend)
4. `feat: paginate admins` (§3d + frontend)
5. `perf(db): add keyset pagination indexes` (§3e)
6. `test: pagination boundary + RBAC coverage` (§5)

---

## 7. Gotchas (project-specific)

- **Elysia response validation strips unknown keys** and runs `normalize`. `nextCursor` MUST be in the response schema or it gets stripped silently. `t.Date()` fields are required for Date-typed values. `onError` responses bypass response validation. (See the team's Elysia validation notes.)
- **Dates over the wire:** `t.Date()` fields serialize to ISO strings client-side (`api.ts` header comment). The cursor already encodes the ISO string — consistent. Don't call `Date` methods on client-side summary dates without `new Date(...)`.
- **`success()` envelope:** responses are `{ ok: true, data: <Paginated> }`. The frontend `unwrap` already digs out `.data`, returning `{ items, nextCursor }`.
- **Drizzle `and(undefined, cond)`** is valid (undefined args ignored) — relied on above to compose optional scope + cursor predicates.
- **OpenAPI** is generated from these schemas; `Paginated()` is inlined via `success()` (nested `$ref` is intentionally avoided per `models.ts` comment) — no extra OpenAPI work needed.

---

## 8. Optional consolidation (separate follow-up, not v1)

Once the four endpoints use the shared helper:
- Migrate `audit-events` (`admin-audit-log.ts`) onto the keyset cursor — **fixes its same-millisecond boundary bug**. Changes `before` query param → `cursor`; update the audit-log frontend client/loader.
- Migrate public `events` (`public-boards.ts` + `apps/public-web`) onto the shared `limit`/`cursor`. This crosses into the public-web app — scope and test separately.

Do these only after the admin set is shipped and stable.

---

## Acceptance criteria

- [ ] All 4 admin list endpoints accept `limit` + `cursor`, return `{ ok, data: { items, nextCursor } }`.
- [ ] Cursor is keyset on `(createdAt, id)` — proven correct across same-`createdAt` rows.
- [ ] RBAC scoping unchanged and verified across page boundaries.
- [ ] Indexes added; migration applied to dev + 5433 test DB.
- [ ] Frontend lists render first page + working "Load more".
- [ ] API + frontend typecheck clean; new boundary/RBAC tests pass; e2e green.
