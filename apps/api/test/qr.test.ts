import { describe, expect, test } from "bun:test";

import type { Database } from "@queue-reminiscence/db";
import type { BoardAccessCredential } from "@queue-reminiscence/db";
import { createTestApp } from "../src/app";
import { testAppConfig } from "./test-config";

type FakeRow = Pick<BoardAccessCredential, "status" | "expiresAt" | "tokenHash">;

function createFakeDb(rows: FakeRow[]): Database {
  const queryChain = {
    from: () => queryChain,
    where: () => queryChain,
    limit: () => Promise.resolve(rows),
  };

  return {
    select: () => queryChain,
  } as unknown as Database;
}

function makeActiveRow(tokenHash: string): FakeRow {
  return { status: "active", expiresAt: null, tokenHash };
}

function makeRevokedRow(tokenHash: string): FakeRow {
  return { status: "revoked", expiresAt: null, tokenHash };
}

function createApp(db: Database) {
  return createTestApp({
    config: testAppConfig,
    db,
    checkDatabase: async () => true,
    rateLimiter: { async checkAndIncrement() {} },
  });
}

describe("GET /api/qr/:accessCode.svg", () => {
  test("active credential returns 200 with SVG", async () => {
    // Use a real-ish access code and pre-compute its hash to return from fake DB
    const accessCode = "abc123testcode";
    const { hashOpaqueToken } = await import("../src/security/tokens");
    const tokenHash = hashOpaqueToken(accessCode, testAppConfig.tokenHmacSecret);

    const db = createFakeDb([makeActiveRow(tokenHash)]);
    const app = createApp(db);

    const response = await app.handle(new Request(`http://localhost/api/qr/${accessCode}.svg`));

    expect(response.status).toBe(200);
    const contentType = response.headers.get("content-type") ?? "";
    expect(contentType.includes("image/svg+xml")).toBe(true);
    const body = await response.text();
    expect(body.includes("<svg")).toBe(true);
  });

  test("buildPublicAccessUrl encodes /q/<accessCode> payload", async () => {
    const { buildPublicAccessUrl } = await import("../src/access/access-url");
    const accessCode = "myaccesscode42";
    const url = buildPublicAccessUrl(testAppConfig, accessCode);
    expect(url.includes("/q/")).toBe(true);
    expect(url.includes(accessCode)).toBe(true);
    expect(url.startsWith(testAppConfig.publicAppUrl)).toBe(true);
  });

  test("revoked credential returns 404", async () => {
    const accessCode = "revokedcode99";
    const { hashOpaqueToken } = await import("../src/security/tokens");
    const tokenHash = hashOpaqueToken(accessCode, testAppConfig.tokenHmacSecret);

    const db = createFakeDb([makeRevokedRow(tokenHash)]);
    const app = createApp(db);

    const response = await app.handle(new Request(`http://localhost/api/qr/${accessCode}.svg`));

    expect(response.status).toBe(404);
  });

  test("unknown access code returns 404", async () => {
    const db = createFakeDb([]);
    const app = createApp(db);

    const response = await app.handle(new Request("http://localhost/api/qr/unknowncode.svg"));

    expect(response.status).toBe(404);
  });

  test("expired credential returns 404", async () => {
    const accessCode = "expiredcode01";
    const { hashOpaqueToken } = await import("../src/security/tokens");
    const tokenHash = hashOpaqueToken(accessCode, testAppConfig.tokenHmacSecret);

    const pastDate = new Date(2020, 0, 1);
    const db = createFakeDb([{ status: "active", expiresAt: pastDate, tokenHash }]);
    const app = createApp(db);

    const response = await app.handle(new Request(`http://localhost/api/qr/${accessCode}.svg`));

    expect(response.status).toBe(404);
  });
});
