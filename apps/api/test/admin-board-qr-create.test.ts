/**
 * Regression: board creation must automatically generate and return an access
 * credential so the admin sees a QR immediately — without a separate
 * "Rotate QR link" step.
 *
 * EXPECTED FAILURE on current code: POST /api/admin/boards returns only
 * { board } with no credential. These tests define the desired contract.
 * They will pass once the create-board route calls boardAccessService and
 * includes credential in its response.
 *
 * DEPENDENCY: requires the backend PR that atomically generates the first
 * access credential during board creation.
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
    expect(json.data.credential).toBeDefined();
    expect(json.data.credential!.accessUrl).toMatch(/\/q\//);
    expect(typeof json.data.credential!.tokenPreview).toBe("string");
    expect(json.data.credential!.version).toBeGreaterThanOrEqual(1);
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
    expect(json.data.credential).toBeDefined();
    // The access service was invoked exactly once for this creation.
    expect(accessService.calls).toHaveLength(1);
    // The boardId passed to the access service matches the created board.
    expect(accessService.calls[0]!.boardId).toBe(json.data.board.id);
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
    expect(credential).toBeDefined();
    // Access URL must point to a /q/<code> path, not be empty or generic.
    expect(credential!.accessUrl).toMatch(/\/q\/[a-zA-Z0-9_-]+/);
    // tokenPreview must be a non-empty string (proves a real token was issued).
    expect(credential!.tokenPreview.length).toBeGreaterThan(0);
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
    expect(response.status).not.toBe(500);
  });
});
