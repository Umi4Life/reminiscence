import { describe, expect, test } from "bun:test";

import type {
  BoardAccessService,
  GetActiveBoardCredentialResult,
  RotateBoardAccessResult,
} from "../src/access/board-access";
import { createTestApp } from "../src/app";
import {
  BOARD_A1,
  boardsFixture,
  createFakeAuthService,
  createFakeBoardManagementService,
  orgOwnerMembership,
  sessionCookie,
  venueStaffMembership,
} from "./admin-fixtures";
import { testAppConfig } from "./test-config";

function createFakeBoardAccessService(
  rotateResult: RotateBoardAccessResult = {
    status: "rotated",
    board: { ...boardsFixture[0]!, displayVersion: 2 },
    credential: {
      id: "credential-1",
      accessUrl: "http://localhost:3000/q/raw-access-code",
      tokenPreview: "raw-ac…s-code",
      version: 1,
      expiresAt: null,
    },
  },
  activeResult: GetActiveBoardCredentialResult = { status: "none" },
): BoardAccessService & { calls: Array<{ adminUserId: string; boardId: string }> } {
  const calls: Array<{ adminUserId: string; boardId: string }> = [];

  return {
    calls,
    async rotateBoardAccessCredential(_rbac, adminUserId, boardId) {
      calls.push({ adminUserId, boardId });
      return rotateResult;
    },
    async getActiveBoardCredential() {
      return activeResult;
    },
  };
}

function createApp(
  accessService = createFakeBoardAccessService(),
  memberships = [orgOwnerMembership],
) {
  return {
    accessService,
    app: createTestApp({
      config: testAppConfig,
      adminAuthService: createFakeAuthService(memberships),
      boardManagementService: createFakeBoardManagementService(),
      boardAccessService: accessService,
      checkDatabase: async () => true,
    }),
  };
}

describe("admin board access credential rotation route", () => {
  test("rotate without session returns 401", async () => {
    const { app } = createApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}/access-credentials/rotate`, {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
  });

  test("valid admin can rotate board access credential", async () => {
    const { app, accessService } = createApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}/access-credentials/rotate`, {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: {
        board: { id: string; displayVersion: number };
        credential: {
          accessUrl: string;
          tokenPreview: string;
          tokenHash?: string;
          version: number;
        };
      };
    };
    expect(json.data.board.id).toBe(BOARD_A1);
    expect(json.data.board.displayVersion).toBe(2);
    expect(json.data.credential.accessUrl).toBe("http://localhost:3000/q/raw-access-code");
    expect(json.data.credential.tokenPreview).toBe("raw-ac…s-code");
    expect(json.data.credential.version).toBe(1);
    expect(json.data.credential.tokenHash === undefined).toBe(true);
    expect(accessService.calls).toEqual([{ adminUserId: "admin-1", boardId: BOARD_A1 }]);
  });

  test("venue staff can use route when service authorizes the board", async () => {
    const { app } = createApp(createFakeBoardAccessService(), [venueStaffMembership]);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}/access-credentials/rotate`, {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
  });

  test("not-found service result becomes 404", async () => {
    const { app } = createApp(createFakeBoardAccessService({ status: "not_found" }));

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}/access-credentials/rotate`, {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(404);
  });
});
