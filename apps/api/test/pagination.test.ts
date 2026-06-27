import { describe, expect, test } from "bun:test";

import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  decodeCursor,
  encodeCursor,
  parsePageRequest,
  toPage,
} from "../src/http/pagination";

describe("encodeCursor / decodeCursor", () => {
  test("roundtrip preserves createdAt and id", () => {
    const d = new Date("2026-06-01T12:00:00.000Z");
    const id = "00000000-0000-4000-8000-000000000001";
    const encoded = encodeCursor(d, id);
    const decoded = decodeCursor(encoded);
    expect(decoded.createdAt.toISOString()).toBe(d.toISOString());
    expect(decoded.id).toBe(id);
  });

  test("produces URL-safe base64 (no +, /, or =)", () => {
    const encoded = encodeCursor(new Date("2026-06-01T00:00:00.000Z"), "some-id");
    expect(/[+/=]/.test(encoded)).toBe(false);
  });

  test("malformed base64 throws validation_error", () => {
    expect(() => decodeCursor("!!!not-base64!!!")).toThrow();
  });

  test("cursor missing pipe separator throws validation_error", () => {
    const noPipe = btoa("nodatehere").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(() => decodeCursor(noPipe)).toThrow();
  });

  test("cursor with invalid ISO date throws validation_error", () => {
    const bad = btoa("not-a-date|some-id")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(() => decodeCursor(bad)).toThrow();
  });

  test("cursor with empty id throws validation_error", () => {
    const bad = btoa("2026-06-01T00:00:00.000Z|")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(() => decodeCursor(bad)).toThrow();
  });
});

describe("toPage", () => {
  const row = (id: string, ms = 0) => ({ createdAt: new Date(ms), id });

  test("fewer than limit rows — no nextCursor", () => {
    const page = toPage([row("a"), row("b")], 20);
    expect(page.items.length).toBe(2);
    expect(page.nextCursor).toBe(null);
  });

  test("exactly limit rows — no nextCursor", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(`id-${i}`));
    const page = toPage(rows, 20);
    expect(page.items.length).toBe(20);
    expect(page.nextCursor).toBe(null);
  });

  test("limit+1 rows — nextCursor encodes the last kept row", () => {
    const rows = Array.from({ length: 21 }, (_, i) =>
      row(`id-${String(i).padStart(3, "0")}`, i * 1000),
    );
    const page = toPage(rows, 20);
    expect(page.items.length).toBe(20);
    expect(typeof page.nextCursor).toBe("string");
    const decoded = decodeCursor(page.nextCursor!);
    expect(decoded.id).toBe("id-019"); // 20th row (index 19)
  });

  test("second page has no overlap with first page — same-createdAt rows sorted by id", () => {
    const ts = new Date("2026-06-01T00:00:00.000Z");
    const rows = ["id-z", "id-m", "id-a", "id-0"].map((id) => ({ createdAt: ts, id }));
    const page1 = toPage(rows, 2);
    expect(page1.items.map((r) => r.id)).toEqual(["id-z", "id-m"]);
    expect(typeof page1.nextCursor).toBe("string");

    const cursor = decodeCursor(page1.nextCursor!);
    const rest = rows.filter(
      (r) =>
        r.createdAt.getTime() < cursor.createdAt.getTime() ||
        (r.createdAt.getTime() === cursor.createdAt.getTime() && r.id < cursor.id),
    );
    const page2 = toPage(rest, 2);
    const page1Ids = new Set(page1.items.map((r) => r.id));
    expect(page2.items.every((r) => !page1Ids.has(r.id))).toBe(true);
    expect(page2.nextCursor).toBe(null);
  });
});

describe("parsePageRequest", () => {
  test("empty query returns defaults", () => {
    const req = parsePageRequest({});
    expect(req.limit).toBe(DEFAULT_LIMIT);
    expect(req.cursor).toBe(null);
  });

  test("limit is clamped to MAX_LIMIT", () => {
    expect(parsePageRequest({ limit: 9999 }).limit).toBe(MAX_LIMIT);
  });

  test("limit is clamped to minimum 1", () => {
    expect(parsePageRequest({ limit: 0 }).limit).toBe(1);
  });

  test("fractional limit is floored", () => {
    expect(parsePageRequest({ limit: 5.9 }).limit).toBe(5);
  });

  test("valid cursor is decoded", () => {
    const d = new Date("2026-06-01T00:00:00.000Z");
    const id = "00000000-0000-4000-8000-000000000001";
    const cursor = encodeCursor(d, id);
    const req = parsePageRequest({ cursor });
    expect(req.cursor?.id).toBe(id);
    expect(req.cursor?.createdAt.toISOString()).toBe(d.toISOString());
  });

  test("malformed cursor throws validation_error", () => {
    expect(() => parsePageRequest({ cursor: "garbage!!!" })).toThrow();
  });
});
