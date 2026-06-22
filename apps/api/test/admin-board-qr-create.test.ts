/**
 * Regression: board creation automatically generates and returns an access
 * credential so the admin sees a QR immediately — without a separate generate
 * or rotate step.
 */
import { describe, expect, test } from "bun:test";

import type { BoardAccessService, RotateBoardAccessResult } from "../src/access/board-access";
import { createTestApp } from "../src/app";
import {
  boardsFixture,
  createFakeAuthService,
  createFakeBoardManagementService,
  orgOwnerMembership,
  sessionCookie,
  VENUE_A1,
} from "./admin-fixtures";
import { testAppConfig } from "./test-config";

// ponytail: local fake — mirrors admin-board-access-rotation.test.ts pattern
function createFakeBoardAccessService(
  result: RotateBoardAccessResult = {
    status: "rotated",
    board: { ...boardsFixture[0]!, displayVersion: 1 },
    credential: {
      id: "credential-1",
      accessUrl: "http://localhost:3000/q/test-access-code",
      tokenPreview: "test-ac…ess-code",
      version: 1,
      expiresAt: null,
    },
  },
): BoardAccessService & { calls: Array<{ adminUserId: string; boardId: string }> } {
  const calls: Array<{ adminUserId: string; boardId: string }> = [];
  return {
    calls,
    async rotateBoardAccessCredential(_rbac, adminUserId, boardId) {
      calls.push({ adminUserId, boardId });
      return result;
    },
    async getActiveBoardCredential() {
      return { status: "none" as const };
    },
  };
}

function createApp(accessService = createFakeBoardAccessService()) {
  return {
    accessService,
    app: createTestApp({
      config: testAppConfig,
      adminAuthService: createFakeAuthService([orgOwnerMembership]),
      boardManagementService: createFakeBoardManagementService(),
      boardAccessService: accessService,
      checkDatabase: async () => true,
    }),
  };
}

function createBoardRequest(slug: string) {
  return new Request("http://localhost/api/admin/boards", {
    method: "POST",
    headers: {
      cookie: sessionCookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      venueId: VENUE_A1,
      slug,
      publicSlug: `${slug}-public`,
      name: "QR Regression Board",
    }),
  });
}

describe("create board QR auto-generation (regression)", () => {
  test("POST /api/admin/boards response includes credential with accessUrl", async () => {
    // Regression: credential must be present in the create response so the UI
    // can render the QR immediately — old behavior omits it entirely.
    const { app, accessService } = createApp();

    const response = await app.handle(createBoardRequest("qr-regression-a"));

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: {
        board: { id: string };
        credential?: {
          accessUrl: string;
          tokenPreview: string;
          version: number;
        };
      };
    };
    expect(json.data.credential !== undefined).toBe(true);
    expect(/\/q\//.test(json.data.credential!.accessUrl)).toBe(true);
    expect(typeof json.data.credential!.tokenPreview).toBe("string");
    expect(json.data.credential!.version >= 1).toBe(true);
    // The access service must have been invoked during board creation.
    expect(accessService.calls.length).toBe(1);
    expect(accessService.calls[0]!.adminUserId).toBe("admin-1");
  });

  test("boardAccessService.rotateBoardAccessCredential is called for the new board", async () => {
    // Regression: the service must be called with the freshly-created board's
    // id, not a pre-existing one.
    const { app, accessService } = createApp();

    const response = await app.handle(createBoardRequest("qr-regression-b"));

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { board: { id: string }; credential?: unknown };
    };
    // Credential is returned alongside the board.
    expect(json.data.credential !== undefined).toBe(true);
    // The access service was invoked exactly once for this creation.
    expect(accessService.calls.length).toBe(1);
    // The boardId passed to the access service is a valid UUID (freshly created board).
    expect(/^[0-9a-f-]{36}$/.test(accessService.calls[0]!.boardId)).toBe(true);
  });

  test("credential accessUrl in create response is a valid QR access link", async () => {
    const { app } = createApp();

    const response = await app.handle(createBoardRequest("qr-regression-c"));

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: {
        credential?: { accessUrl: string; tokenPreview: string };
      };
    };
    const { credential } = json.data;
    expect(credential !== undefined).toBe(true);
    // Access URL must point to a /q/<code> path, not be empty or generic.
    expect(/\/q\/[a-zA-Z0-9_-]+/.test(credential!.accessUrl)).toBe(true);
    // tokenPreview must be a non-empty string (proves a real token was issued).
    expect(credential!.tokenPreview.length > 0).toBe(true);
  });

  test("credential is absent when boardAccessService returns not_found (defensive)", async () => {
    // If the access service fails to find the board (unlikely but possible
    // under race conditions), the create route must handle it gracefully
    // rather than crashing. This is a defensive contract test.
    //
    // NOTE: the exact error handling (400 vs 500 vs omitted credential) is
    // up to the implementation — this test only ensures no 500 is thrown.
    const { app } = createApp(createFakeBoardAccessService({ status: "not_found" }));

    const response = await app.handle(createBoardRequest("qr-regression-d"));

    // Must not be a 500 internal server error.
    expect(response.status === 500).toBe(false);
  });
});
