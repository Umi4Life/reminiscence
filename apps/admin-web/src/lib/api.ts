import { treaty } from "@elysia/eden";
import type {
  App,
  AdminSessionContext,
  AdminUserSummary,
  BoardSummary,
  OrganizationSummary,
  PublicBoardEventItem,
  PublicBoardReadData,
  RotatedBoardAccessCredential,
  VenueSummary,
} from "@queue-reminiscence/api/types";

import { API_BASE_URL } from "./env";

type FetchFn = typeof globalThis.fetch;

// Types are sourced from the API package (single source of truth across the
// network boundary) rather than re-declared here. Note: date fields are typed
// `Date` (from the server's `t.Date()` schemas) but arrive as ISO strings over
// HTTP — consume them via `new Date(value)`, never by calling Date methods.
export type {
  AdminUserSummary,
  BoardSummary,
  OrganizationSummary,
  RotatedBoardAccessCredential,
  VenueSummary,
};
export type AdminUserStatus = "active" | "disabled";
export type MeData = AdminSessionContext;
export type RotateResult = { board: BoardSummary; credential: RotatedBoardAccessCredential };
export type PublicBoardData = PublicBoardReadData;
export type PublicBoardEvent = PublicBoardEventItem;
export type PublicQueueEntry = PublicBoardReadData["queue"][number];

export interface CreateOrganizationInput {
  slug: string;
  name: string;
}

export interface PatchOrganizationInput {
  slug?: string;
  name?: string;
}

// Request inputs accepted by the create/patch endpoints (the editable subset).
export interface CreateVenueInput {
  organizationId: string;
  slug: string;
  name: string;
  timezone: string;
  address?: string | null;
}

export interface PatchVenueInput {
  slug?: string;
  name?: string;
  timezone?: string;
  address?: string | null;
}

export interface CreateBoardInput {
  venueId: string;
  slug: string;
  publicSlug: string;
  name: string;
  description?: string | null;
}

export interface PatchBoardInput {
  slug?: string;
  publicSlug?: string;
  name?: string;
  description?: string | null;
}

// Eden derives the `/api` prefix from the route paths, so the treaty domain is
// the API origin without it. An absolute base (cross-origin in dev/e2e) is
// stripped to its origin; a relative base falls back to the page origin.
function apiOrigin(): string {
  if (API_BASE_URL.startsWith("http")) return API_BASE_URL.replace(/\/api\/?$/, "");
  return typeof window !== "undefined" ? window.location.origin : "";
}

function client(fetchFn: FetchFn) {
  return treaty<App>(apiOrigin(), {
    fetch: { credentials: "include" },
    fetcher: fetchFn,
  });
}

type TreatyResult = { data: unknown; error: { value: unknown } | null };

async function unwrap<T>(call: Promise<TreatyResult>): Promise<T> {
  const { data, error } = await call;
  if (error) {
    const body = error.value as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? "Request failed");
  }
  return (data as { data: T }).data;
}

export async function listOrganizations(
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ organizations: OrganizationSummary[] }> {
  return unwrap<{ organizations: OrganizationSummary[] }>(
    client(fetchFn).api.admin.organizations.get(),
  );
}

export async function createOrganization(
  body: CreateOrganizationInput,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ organization: OrganizationSummary }> {
  return unwrap<{ organization: OrganizationSummary }>(
    client(fetchFn).api.admin.organizations.post(body),
  );
}

export async function updateOrganization(
  orgId: string,
  body: PatchOrganizationInput,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ organization: OrganizationSummary }> {
  return unwrap<{ organization: OrganizationSummary }>(
    client(fetchFn).api.admin.organizations({ orgId }).patch(body),
  );
}

export async function deleteOrganization(
  orgId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<void> {
  await unwrap(client(fetchFn).api.admin.organizations({ orgId }).delete());
}

export async function login(
  email: string,
  password: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<MeData> {
  return unwrap<MeData>(client(fetchFn).api.admin.auth.login.post({ email, password }));
}

export async function logout(fetchFn: FetchFn = globalThis.fetch): Promise<void> {
  await unwrap(client(fetchFn).api.admin.auth.logout.post());
}

export async function getMe(fetchFn: FetchFn = globalThis.fetch): Promise<MeData> {
  return unwrap<MeData>(client(fetchFn).api.admin.me.get());
}

export async function listBoards(
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ boards: BoardSummary[] }> {
  return unwrap<{ boards: BoardSummary[] }>(client(fetchFn).api.admin.boards.get());
}

export async function listVenues(
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ venues: VenueSummary[] }> {
  return unwrap<{ venues: VenueSummary[] }>(client(fetchFn).api.admin.venues.get());
}

export async function createVenue(
  body: CreateVenueInput,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ venue: VenueSummary }> {
  return unwrap<{ venue: VenueSummary }>(client(fetchFn).api.admin.venues.post(body));
}

export async function getVenue(
  venueId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ venue: VenueSummary }> {
  return unwrap<{ venue: VenueSummary }>(client(fetchFn).api.admin.venues({ venueId }).get());
}

export async function updateVenue(
  venueId: string,
  body: PatchVenueInput,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ venue: VenueSummary }> {
  return unwrap<{ venue: VenueSummary }>(client(fetchFn).api.admin.venues({ venueId }).patch(body));
}

export async function deleteVenue(
  venueId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<void> {
  await unwrap(client(fetchFn).api.admin.venues({ venueId }).delete());
}

export async function createBoard(
  body: CreateBoardInput,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ board: BoardSummary }> {
  return unwrap<{ board: BoardSummary }>(client(fetchFn).api.admin.boards.post(body));
}

export async function updateBoard(
  boardId: string,
  body: PatchBoardInput,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ board: BoardSummary }> {
  return unwrap<{ board: BoardSummary }>(client(fetchFn).api.admin.boards({ boardId }).patch(body));
}

export async function getBoard(
  boardId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ board: BoardSummary; credential: RotatedBoardAccessCredential | null }> {
  // ponytail: credential absent on main until PR#73 merges → normalize to null
  const raw = await unwrap<{
    board: BoardSummary;
    credential?: RotatedBoardAccessCredential | null;
  }>(client(fetchFn).api.admin.boards({ boardId }).get());
  return { board: raw.board, credential: raw.credential ?? null };
}

export async function openBoard(
  boardId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ board: BoardSummary }> {
  return unwrap<{ board: BoardSummary }>(client(fetchFn).api.admin.boards({ boardId }).open.post());
}

export async function closeBoard(
  boardId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ board: BoardSummary }> {
  return unwrap<{ board: BoardSummary }>(
    client(fetchFn).api.admin.boards({ boardId }).close.post(),
  );
}

export async function resetBoard(
  boardId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ board: BoardSummary }> {
  return unwrap<{ board: BoardSummary }>(
    client(fetchFn).api.admin.boards({ boardId }).reset.post(),
  );
}

export async function deleteBoard(
  boardId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<void> {
  await unwrap(client(fetchFn).api.admin.boards({ boardId }).delete());
}

export async function rotateAccessCredential(
  boardId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<RotateResult> {
  return unwrap<RotateResult>(
    client(fetchFn).api.admin.boards({ boardId })["access-credentials"].rotate.post(),
  );
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<void> {
  await unwrap(
    client(fetchFn).api.admin.auth["change-password"].post({ currentPassword, newPassword }),
  );
}

export async function getPublicBoard(
  publicSlug: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ board: PublicBoardData } | null> {
  try {
    return await unwrap<{ board: PublicBoardData }>(
      client(fetchFn).api.public.boards({ publicSlug }).get(),
    );
  } catch {
    return null;
  }
}

export async function getPublicBoardEvents(
  publicSlug: string,
  limit?: number,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ events: PublicBoardEvent[] }> {
  return unwrap<{ events: PublicBoardEvent[] }>(
    client(fetchFn)
      .api.public.boards({ publicSlug })
      .events.get(limit !== undefined ? { query: { limit } } : {}),
  );
}

export interface CreateAdminInput {
  email: string;
  displayName: string;
  password: string;
  // Optional initial membership granted atomically with the user. Required for
  // org_owner / venue_manager creators (role/scope limited by the chain of command).
  membership?: {
    organizationId: string;
    venueId: string | null;
    role: "org_owner" | "venue_manager" | "venue_staff";
  };
}

export interface PatchAdminInput {
  displayName?: string;
  status?: AdminUserStatus;
}

export interface AssignMembershipInput {
  organizationId: string;
  venueId?: string | null;
  role: "org_owner" | "venue_manager" | "venue_staff";
}

export async function listAdmins(
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ admins: AdminUserSummary[] }> {
  return unwrap<{ admins: AdminUserSummary[] }>(client(fetchFn).api.admin.admins.get());
}

export async function createAdmin(
  body: CreateAdminInput,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ admin: AdminUserSummary }> {
  return unwrap<{ admin: AdminUserSummary }>(client(fetchFn).api.admin.admins.post(body));
}

export async function getAdmin(
  adminUserId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ admin: AdminUserSummary }> {
  return unwrap<{ admin: AdminUserSummary }>(
    client(fetchFn).api.admin.admins({ adminUserId }).get(),
  );
}

export async function updateAdmin(
  adminUserId: string,
  body: PatchAdminInput,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ admin: AdminUserSummary }> {
  return unwrap<{ admin: AdminUserSummary }>(
    client(fetchFn).api.admin.admins({ adminUserId }).patch(body),
  );
}

export async function resetAdminPassword(
  adminUserId: string,
  newPassword: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<void> {
  const adminApi = client(fetchFn).api.admin.admins({ adminUserId });
  await unwrap(adminApi["password-reset"].post({ password: newPassword }));
}

export async function assignMembership(
  adminUserId: string,
  body: AssignMembershipInput,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{
  membership: { id: string; organizationId: string; venueId: string | null; role: string };
}> {
  return unwrap(
    client(fetchFn).api.admin.memberships.post({
      adminUserId,
      ...body,
      // Normalize optional venueId → null; the API expects string | null, not undefined.
      venueId: body.venueId ?? null,
    }),
  );
}

export async function revokeMembership(
  adminUserId: string,
  membershipId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<void> {
  await unwrap(client(fetchFn).api.admin.memberships({ id: membershipId }).delete());
}
