import { validationError } from "./errors";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface PageRequest {
  limit: number;
  cursor: { createdAt: Date; id: string } | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function encodeCursor(createdAt: Date, id: string): string {
  return btoa(`${createdAt.toISOString()}|${id}`)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeCursor(raw: string): { createdAt: Date; id: string } {
  let decoded: string;
  try {
    decoded = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    throw validationError("Invalid pagination cursor.");
  }
  const pipe = decoded.indexOf("|");
  if (pipe === -1) throw validationError("Invalid pagination cursor.");
  const isoStr = decoded.slice(0, pipe);
  const id = decoded.slice(pipe + 1);
  const ts = new Date(isoStr);
  if (Number.isNaN(ts.getTime()) || !id) throw validationError("Invalid pagination cursor.");
  return { createdAt: ts, id };
}

export function parsePageRequest(query: { limit?: number; cursor?: string }): PageRequest {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(query.limit ?? DEFAULT_LIMIT)));
  const cursor = query.cursor !== undefined ? decodeCursor(query.cursor) : null;
  return { limit, cursor };
}

export function toPage<T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number,
): Page<T> {
  if (rows.length <= limit) {
    return { items: rows, nextCursor: null };
  }
  const items = rows.slice(0, limit);
  const last = items[items.length - 1]!;
  return { items, nextCursor: encodeCursor(last.createdAt, last.id) };
}
