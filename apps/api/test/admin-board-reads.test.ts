import { describe, expect, test } from "bun:test";

import { createTestApp } from "../src/app";
import {
  BOARD_A1,
  BOARD_A2,
  BOARD_B1,
  createFakeAuthService,
  createFakeBoardAccessService,
  createFakeBoardManagementService,
  orgOwnerMembership,
  sessionCookie,
  venueManagerMembership,
  venueStaffMembership,
} from "./admin-fixtures";
import { testAppConfig } from "./test-config";

function createApp(memberships = [orgOwnerMembership]) {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService(memberships),
    boardManagementService: createFakeBoardManagementService(),
    boardAccessService: createFakeBoardAccessService(),
    checkDatabase: async () => true,
  });
}

describe("admin board read routes", () => {
  test("org owner sees all boards in owned organizations", async () => {
    const app = createApp([orgOwnerMembership]);

    const response = await app.handle(
      new Request("http://localhost/api/admin/boards", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { boards: Array<{ id: string }> };
    };
    expect(json.data.boards.map((board) => board.id).sort()).toEqual([BOARD_A1, BOARD_A2].sort());
  });

  test("venue manager sees boards in assigned venues only", async () => {
    const app = createApp([venueManagerMembership]);

    const response = await app.handle(
      new Request("http://localhost/api/admin/boards", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { boards: Array<{ id: string }> };
    };
    expect(json.data.boards.length).toBe(1);
    expect(json.data.boards[0]?.id).toBe(BOARD_A1);
  });

  test("venue staff sees boards in assigned venues only", async () => {
    const app = createApp([venueStaffMembership]);

    const response = await app.handle(
      new Request("http://localhost/api/admin/boards", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { boards: Array<{ id: string }> };
    };
    expect(json.data.boards.length).toBe(1);
    expect(json.data.boards[0]?.id).toBe(BOARD_A1);
  });

  test("returns empty list for admin with no memberships", async () => {
    const app = createApp([]);

    const response = await app.handle(
      new Request("http://localhost/api/admin/boards", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { boards: [], nextCursor: null } });
  });

  test("board detail returns board and credential for accessible board", async () => {
    const app = createApp([venueStaffMembership]);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}`, {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { board: { id: string }; credential: null };
    };
    expect(json.data.board.id).toBe(BOARD_A1);
    expect(json.data.credential).toBe(null);
  });

  test("board detail returns 404 for inaccessible board to avoid existence leak", async () => {
    const app = createApp([venueStaffMembership]);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A2}`, {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "not_found", message: "Resource not found." },
    });
  });

  test("board detail returns 404 for unknown board id", async () => {
    const app = createApp([orgOwnerMembership]);

    const response = await app.handle(
      new Request("http://localhost/api/admin/boards/00000000-0000-4000-8000-000000009999", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "not_found", message: "Resource not found." },
    });
  });

  test("board detail returns 404 for board in inaccessible organization", async () => {
    const app = createApp([venueManagerMembership]);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_B1}`, {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "not_found", message: "Resource not found." },
    });
  });

  test("returns 401 without a session cookie", async () => {
    const app = createApp();

    const response = await app.handle(new Request("http://localhost/api/admin/boards"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "Authentication required." },
    });
  });
});
