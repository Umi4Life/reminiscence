import { describe, expect, test } from "bun:test";

import { createTestApp } from "../src/app";
import {
  BOARD_A1,
  BOARD_A2,
  BOARD_B1,
  createFakeAuthService,
  createFakeBoardManagementHarness,
  orgOwnerMembership,
  sessionCookie,
  venueManagerMembership,
  venueStaffMembership,
} from "./admin-fixtures";
import { testAppConfig } from "./test-config";

function createApp(
  memberships = [orgOwnerMembership],
  harness = createFakeBoardManagementHarness(),
) {
  return {
    app: createTestApp({
      config: testAppConfig,
      adminAuthService: createFakeAuthService(memberships),
      boardManagementService: harness.service,
      checkDatabase: async () => true,
    }),
    harness,
  };
}

function closedBoardA1() {
  return {
    ...createFakeBoardManagementHarness().boards.find((board) => board.id === BOARD_A1)!,
    status: "closed" as const,
    displayVersion: 1,
  };
}

describe("admin board operation routes", () => {
  test("open without session returns 401", async () => {
    const { app } = createApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}/open`, { method: "POST" }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "Authentication required." },
    });
  });

  test("close without session returns 401", async () => {
    const { app } = createApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}/close`, { method: "POST" }),
    );

    expect(response.status).toBe(401);
  });

  test("reset without session returns 401", async () => {
    const { app } = createApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}/reset`, { method: "POST" }),
    );

    expect(response.status).toBe(401);
  });

  test("venue staff assigned to venue can open board", async () => {
    const harness = createFakeBoardManagementHarness([closedBoardA1()]);
    const { app } = createApp([venueStaffMembership], harness);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}/open`, {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { board: { status: string; displayVersion: number }; changed: boolean };
    };
    expect(json.data.board.status).toBe("open");
    expect(json.data.board.displayVersion).toBe(2);
    expect(json.data.changed).toBe(true);
    expect(harness.events).toEqual([
      { boardId: BOARD_A1, type: "board_opened", actorAdminUserId: "admin-1" },
    ]);
  });

  test("venue manager assigned to venue can open board", async () => {
    const harness = createFakeBoardManagementHarness([closedBoardA1()]);
    const { app } = createApp([venueManagerMembership], harness);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}/open`, {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
  });

  test("org owner can open board", async () => {
    const harness = createFakeBoardManagementHarness([closedBoardA1()]);
    const { app } = createApp([orgOwnerMembership], harness);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}/open`, {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
  });

  test("venue staff for another venue receives 403 on open", async () => {
    const harness = createFakeBoardManagementHarness();
    const boardA2 = harness.boards.find((board) => board.id === BOARD_A2);
    if (boardA2) {
      boardA2.status = "closed";
    }
    const { app } = createApp([venueStaffMembership], harness);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A2}/open`, {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "forbidden",
        message: "You do not have permission to perform this action.",
      },
    });
  });

  test("admin with no memberships receives 403 on reset", async () => {
    const harness = createFakeBoardManagementHarness([closedBoardA1()]);
    const { app } = createApp([], harness);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}/reset`, {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(403);
  });

  test("open on closed board creates event and increments displayVersion", async () => {
    const harness = createFakeBoardManagementHarness([closedBoardA1()]);
    const { app } = createApp([orgOwnerMembership], harness);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}/open`, {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { board: { status: string; displayVersion: number }; changed: boolean };
    };
    expect(json.data.changed).toBe(true);
    expect(json.data.board.status).toBe("open");
    expect(json.data.board.displayVersion).toBe(2);
    expect(harness.events.length).toBe(1);
    expect(harness.events[0]?.type).toBe("board_opened");
  });

  test("open on already-open board is idempotent", async () => {
    const harness = createFakeBoardManagementHarness();
    const openBoard = harness.boards.find((board) => board.id === BOARD_A1)!;
    openBoard.displayVersion = 5;
    const { app } = createApp([orgOwnerMembership], harness);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}/open`, {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { board: { status: string; displayVersion: number }; changed: boolean };
    };
    expect(json.data.changed).toBe(false);
    expect(json.data.board.status).toBe("open");
    expect(json.data.board.displayVersion).toBe(5);
    expect(harness.events.length).toBe(0);
  });

  test("close on open board creates event and increments displayVersion", async () => {
    const harness = createFakeBoardManagementHarness();
    const { app } = createApp([orgOwnerMembership], harness);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}/close`, {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { board: { status: string; displayVersion: number }; changed: boolean };
    };
    expect(json.data.changed).toBe(true);
    expect(json.data.board.status).toBe("closed");
    expect(json.data.board.displayVersion).toBe(2);
    expect(harness.events[0]?.type).toBe("board_closed");
  });

  test("close on already-closed board is idempotent", async () => {
    const harness = createFakeBoardManagementHarness([closedBoardA1()]);
    const { app } = createApp([orgOwnerMembership], harness);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}/close`, {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { board: { status: string; displayVersion: number }; changed: boolean };
    };
    expect(json.data.changed).toBe(false);
    expect(json.data.board.displayVersion).toBe(1);
    expect(harness.events.length).toBe(0);
  });

  test("reset always creates event and increments displayVersion", async () => {
    const harness = createFakeBoardManagementHarness();
    const board = harness.boards.find((candidate) => candidate.id === BOARD_A1)!;
    board.displayVersion = 3;
    board.nextSortOrder = 7;
    const { app } = createApp([orgOwnerMembership], harness);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}/reset`, {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { board: { displayVersion: number; nextSortOrder: number }; changed: boolean };
    };
    expect(json.data.changed).toBe(true);
    expect(json.data.board.displayVersion).toBe(4);
    expect(json.data.board.nextSortOrder).toBe(7);
    expect(harness.events).toEqual([
      { boardId: BOARD_A1, type: "board_reset", actorAdminUserId: "admin-1" },
    ]);
  });

  test("unknown board id returns 404", async () => {
    const { app } = createApp([orgOwnerMembership]);

    const response = await app.handle(
      new Request("http://localhost/api/admin/boards/00000000-0000-4000-8000-000000009999/open", {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "not_found", message: "Resource not found." },
    });
  });

  test("board in inaccessible organization returns 403 for venue manager", async () => {
    const harness = createFakeBoardManagementHarness();
    const { app } = createApp([venueManagerMembership], harness);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_B1}/open`, {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(403);
  });
});
