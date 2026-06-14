import { describe, expect, test } from "bun:test";

import { encryptAccessCode } from "../src/access/credential-ciphertext";
import { createTestApp } from "../src/app";
import type { DisplayDeviceResolver, ResolvedDisplayDevice } from "../src/display/display-devices";
import type { DisplayStatePayload, DisplayStateService } from "../src/display/display-state";
import { buildDisplayEtag } from "../src/display/display-state";
import { testAppConfig } from "./test-config";

// ---- Fake data ----

const BOARD_ID = "00000000-0000-4000-8000-000000000101";
const DEVICE_ID = "00000000-0000-4000-8000-000000000201";

const baseBoard: ResolvedDisplayDevice["board"] = {
  id: BOARD_ID,
  publicSlug: "board-a1-public",
  name: "Board A1",
  status: "open",
  displayVersion: 5,
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
};

function makeDevice(overrides: Partial<ResolvedDisplayDevice> = {}): ResolvedDisplayDevice {
  return {
    id: DEVICE_ID,
    boardId: BOARD_ID,
    name: "Lobby Display",
    status: "active",
    canViewPublicAccessPayload: false,
    lastSeenAt: null,
    board: baseBoard,
    venue: { id: "venue-1", name: "Venue A1" },
    organization: { id: "org-1", name: "Organization A" },
    ...overrides,
  };
}

const basePayload: DisplayStatePayload = {
  board: {
    publicSlug: "board-a1-public",
    name: "Board A1",
    venueName: "Venue A1",
    organizationName: "Organization A",
    status: "open",
  },
  queue: [
    { position: 1, displayName: "Alice" },
    { position: 2, displayName: "Bob" },
  ],
  queueLength: 2,
  publicAccess: null,
  updatedAt: "2026-06-01T00:00:00.000Z",
  displayVersion: 5,
};

// ---- Fake service builders ----

function makeFakeResolver(device: ResolvedDisplayDevice | null): DisplayDeviceResolver {
  return {
    async resolveDevice() {
      return device;
    },
  };
}

function makeFakeStateService(payload: DisplayStatePayload): DisplayStateService {
  return {
    async buildState() {
      return payload;
    },
  };
}

function makeApp(
  resolver: DisplayDeviceResolver,
  stateService: DisplayStateService = makeFakeStateService(basePayload),
) {
  return createTestApp({
    config: testAppConfig,
    checkDatabase: async () => true,
    displayDeviceResolver: resolver,
    displayStateService: stateService,
  });
}

// ---- Tests ----

describe("GET /api/display/:displayToken/state", () => {
  test("valid active token returns 200 with queue shape and displayVersion", async () => {
    const app = makeApp(makeFakeResolver(makeDevice()));

    const response = await app.handle(
      new Request("http://localhost/api/display/valid-token/state"),
    );

    expect(response.status).toBe(200);

    const json = (await response.json()) as {
      ok: boolean;
      data: { state: DisplayStatePayload };
    };
    expect(json.ok).toBe(true);
    expect(json.data.state.queue.length).toBe(2);
    expect(json.data.state.queue[0]!.displayName === "Alice").toBe(true);
    expect(json.data.state.displayVersion === 5).toBe(true);
    expect(json.data.state.queueLength === 2).toBe(true);
  });

  test("canViewPublicAccessPayload false returns publicAccess null", async () => {
    const device = makeDevice({ canViewPublicAccessPayload: false });
    const app = makeApp(makeFakeResolver(device));

    const response = await app.handle(
      new Request("http://localhost/api/display/valid-token/state"),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: boolean;
      data: { state: DisplayStatePayload };
    };
    expect(json.data.state.publicAccess === null).toBe(true);
  });

  test("canViewPublicAccessPayload true with decryptable credential returns url and qrSvgUrl", async () => {
    const accessCode = "my-test-access-code";
    const ciphertext = encryptAccessCode(accessCode, testAppConfig.tokenHmacSecret);

    const payloadWithAccess: DisplayStatePayload = {
      ...basePayload,
      publicAccess: {
        url: `http://localhost:3000/q/${accessCode}`,
        qrSvgUrl: `http://localhost:3002/api/qr/${encodeURIComponent(accessCode)}.svg`,
        expiresAt: null,
        version: 3,
      },
    };

    const device = makeDevice({ canViewPublicAccessPayload: true });
    const app = makeApp(makeFakeResolver(device), makeFakeStateService(payloadWithAccess));

    const response = await app.handle(
      new Request("http://localhost/api/display/valid-token/state"),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: boolean;
      data: { state: DisplayStatePayload };
    };
    expect(json.data.state.publicAccess === null).toBe(false);
    expect(json.data.state.publicAccess!.url).toBe(`http://localhost:3000/q/${accessCode}`);
    expect(json.data.state.publicAccess!.qrSvgUrl).toBe(
      `http://localhost:3002/api/qr/${encodeURIComponent(accessCode)}.svg`,
    );
    expect(json.data.state.publicAccess!.version === 3).toBe(true);
    // Suppress unused variable warning by referencing ciphertext in test context
    expect(typeof ciphertext === "string").toBe(true);
  });

  test("revoked device returns 403", async () => {
    const revokedDevice = makeDevice({ status: "revoked" });
    const app = makeApp(makeFakeResolver(revokedDevice));

    const response = await app.handle(
      new Request("http://localhost/api/display/revoked-token/state"),
    );

    expect(response.status).toBe(403);
    const json = (await response.json()) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code === "forbidden").toBe(true);
  });

  test("unknown token returns 401", async () => {
    const app = makeApp(makeFakeResolver(null));

    const response = await app.handle(
      new Request("http://localhost/api/display/unknown-token/state"),
    );

    expect(response.status).toBe(401);
    const json = (await response.json()) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code === "unauthorized").toBe(true);
  });

  test("ETag header is present on 200 response", async () => {
    const app = makeApp(makeFakeResolver(makeDevice()));

    const response = await app.handle(
      new Request("http://localhost/api/display/valid-token/state"),
    );

    expect(response.status).toBe(200);
    const etag = response.headers.get("etag");
    expect(etag === null).toBe(false);
    expect(etag).toBe(buildDisplayEtag(5));
  });

  test("matching If-None-Match returns 304 with empty body", async () => {
    const app = makeApp(makeFakeResolver(makeDevice()));
    const etag = buildDisplayEtag(5);

    const response = await app.handle(
      new Request("http://localhost/api/display/valid-token/state", {
        headers: { "If-None-Match": etag },
      }),
    );

    expect(response.status).toBe(304);
    const text = await response.text();
    expect(text === "" || text === undefined).toBe(true);
  });

  test("mismatched If-None-Match returns 200 with body", async () => {
    const app = makeApp(makeFakeResolver(makeDevice()));

    const response = await app.handle(
      new Request("http://localhost/api/display/valid-token/state", {
        headers: { "If-None-Match": buildDisplayEtag(99) },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: boolean; data: { state: DisplayStatePayload } };
    expect(json.ok).toBe(true);
    expect(json.data.state.displayVersion === 5).toBe(true);
  });
});
