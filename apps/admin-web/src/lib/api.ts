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

export interface AdminIdentity {
  id: string;
  email: string;
  displayName: string;
}

export interface AdminMembership {
  id: string;
  organizationId: string;
  venueId: string | null;
  role: string;
}

export interface MeData {
  admin: AdminIdentity;
  memberships: AdminMembership[];
}

export interface BoardSummary {
  id: string;
  venueId: string;
  organizationId: string;
  slug: string;
  publicSlug: string;
  name: string;
  description: string | null;
  status: "open" | "closed";
  publicViewPolicy: string;
  publicAddPolicy: string;
  publicRemovePolicy: string;
  qrRotationPolicy: string;
  qrRotationIntervalMinutes: number | null;
  nextSortOrder: number;
  displayVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface RotatedCredential {
  id: string;
  accessUrl: string;
  tokenPreview: string;
  version: number;
  expiresAt: string | null;
}

export interface RotateResult {
  board: BoardSummary;
  credential: RotatedCredential;
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

export async function login(
  email: string,
  password: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<MeData> {
  return apiFetch<MeData>("/admin/auth/login", jsonPost({ email, password }), fetchFn);
}

export async function logout(fetchFn: FetchFn = globalThis.fetch): Promise<void> {
  await apiFetch<{ loggedOut: boolean }>("/admin/auth/logout", { method: "POST" }, fetchFn);
}

export async function getMe(fetchFn: FetchFn = globalThis.fetch): Promise<MeData> {
  return apiFetch<MeData>("/admin/me", { method: "GET" }, fetchFn);
}

export async function listBoards(
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ boards: BoardSummary[] }> {
  return apiFetch<{ boards: BoardSummary[] }>("/admin/boards", { method: "GET" }, fetchFn);
}

export async function getBoard(
  boardId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ board: BoardSummary }> {
  return apiFetch<{ board: BoardSummary }>(
    `/admin/boards/${encodeURIComponent(boardId)}`,
    { method: "GET" },
    fetchFn,
  );
}

export async function openBoard(
  boardId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ board: BoardSummary }> {
  return apiFetch<{ board: BoardSummary }>(
    `/admin/boards/${encodeURIComponent(boardId)}/open`,
    { method: "POST" },
    fetchFn,
  );
}

export async function closeBoard(
  boardId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ board: BoardSummary }> {
  return apiFetch<{ board: BoardSummary }>(
    `/admin/boards/${encodeURIComponent(boardId)}/close`,
    { method: "POST" },
    fetchFn,
  );
}

export async function resetBoard(
  boardId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ board: BoardSummary }> {
  return apiFetch<{ board: BoardSummary }>(
    `/admin/boards/${encodeURIComponent(boardId)}/reset`,
    { method: "POST" },
    fetchFn,
  );
}

export async function rotateAccessCredential(
  boardId: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<RotateResult> {
  return apiFetch<RotateResult>(
    `/admin/boards/${encodeURIComponent(boardId)}/access-credentials/rotate`,
    { method: "POST" },
    fetchFn,
  );
}

export interface PublicQueueEntry {
  id: string;
  displayName: string;
  position: number;
  sortOrder: number;
  createdAt: string;
}

export interface PublicBoardData {
  organization: { id: string; slug: string; name: string };
  venue: { id: string; slug: string; name: string };
  board: {
    publicSlug: string;
    name: string;
    description: string | null;
    status: "open" | "closed";
    displayVersion: number;
    updatedAt: string;
  };
  queue: PublicQueueEntry[];
}

export interface PublicBoardEvent {
  id: string;
  type: string;
  publicMessage: string;
  displayNameSnapshot: string | null;
  createdAt: string;
}

export async function getPublicBoard(
  publicSlug: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<{ board: PublicBoardData } | null> {
  try {
    return await apiFetch<{ board: PublicBoardData }>(
      `/public/boards/${encodeURIComponent(publicSlug)}`,
      { method: "GET" },
      fetchFn,
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
  const query = limit !== undefined ? `?limit=${limit}` : "";
  return apiFetch<{ events: PublicBoardEvent[] }>(
    `/public/boards/${encodeURIComponent(publicSlug)}/events${query}`,
    { method: "GET" },
    fetchFn,
  );
}
