import { API_BASE_URL } from "./env";

type FetchFn = typeof globalThis.fetch;

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

interface ApiError {
  ok: false;
  error: { code: string; message: string };
}

type ApiEnvelope<T> = ApiSuccess<T> | ApiError;

interface Board {
  id: string;
  publicSlug: string;
}

export interface ClaimSuccessData {
  claimed: true;
  board: Board;
  mutationAccessExpiresAt: string;
}

export interface ClaimNotClaimedData {
  claimed: false;
  reason: "expired" | "revoked" | "invalid";
  board?: Board;
  message: string;
}

export type ClaimData = ClaimSuccessData | ClaimNotClaimedData;

export interface QueueEntry {
  id: string;
  displayName: string;
  position: number;
  sortOrder: number;
  createdAt: string;
}

export interface MutationAccess {
  available: boolean;
  expiresAt: string | null;
  canAdd: boolean;
  canRemove: boolean;
}

export interface BoardData {
  organization: { id: string; slug: string; name: string };
  venue: { id: string; slug: string; name: string };
  board: {
    publicSlug: string;
    name: string;
    description: string | null;
    status: "open" | "closed";
    publicAddPolicy: string;
    publicRemovePolicy: string;
    displayVersion: number;
    updatedAt: string;
  };
  queue: QueueEntry[];
  mutationAccess: MutationAccess;
}

export interface BoardEvent {
  id: string;
  type: string;
  publicMessage: string;
  displayNameSnapshot: string | null;
  createdAt: string;
}

async function apiFetch<T>(path: string, init: RequestInit, fetchFn: FetchFn): Promise<T> {
  const response = await fetchFn(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
  });

  const envelope = (await response.json()) as ApiEnvelope<T>;

  if (!envelope.ok) {
    throw new Error(envelope.error.message);
  }

  return envelope.data;
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function claimAccess(
  accessCode: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<ClaimData> {
  return apiFetch<ClaimData>("/public/access/claim", jsonPost({ accessCode }), fetchFn);
}

export async function getBoard(
  publicSlug: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ board: BoardData }> {
  return apiFetch<{ board: BoardData }>(
    `/public/boards/${encodeURIComponent(publicSlug)}`,
    { method: "GET" },
    fetchFn,
  );
}

export async function getBoardEvents(
  publicSlug: string,
  limit?: number,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ events: BoardEvent[] }> {
  const query = limit !== undefined ? `?limit=${limit}` : "";
  return apiFetch<{ events: BoardEvent[] }>(
    `/public/boards/${encodeURIComponent(publicSlug)}/events${query}`,
    { method: "GET" },
    fetchFn,
  );
}

export async function addEntry(
  publicSlug: string,
  displayName: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ entry: QueueEntry }> {
  return apiFetch<{ entry: QueueEntry }>(
    `/public/boards/${encodeURIComponent(publicSlug)}/entries`,
    jsonPost({ displayName }),
    fetchFn,
  );
}

export async function removeEntry(
  publicSlug: string,
  entryId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ removed: boolean }> {
  return apiFetch<{ removed: boolean }>(
    `/public/boards/${encodeURIComponent(publicSlug)}/entries/${encodeURIComponent(entryId)}/remove`,
    { method: "POST" },
    fetchFn,
  );
}

export async function logout(fetchFn: FetchFn = globalThis.fetch): Promise<void> {
  await apiFetch<{ loggedOut: boolean }>("/public/access/logout", { method: "POST" }, fetchFn);
}
