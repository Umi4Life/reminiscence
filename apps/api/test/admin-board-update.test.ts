import { describe, expect, test } from "bun:test";

import { createTestApp } from "../src/app";
import {
  BOARD_A1,
  BOARD_A2,
  createFakeAuthService,
  createFakeBoardManagementService,
  orgOwnerMembership,
  sessionCookie,
  VENUE_A1,
  venueManagerMembership,
  venueStaffMembership,
} from "./admin-fixtures";
import { testAppConfig } from "./test-config";

function createApp(
  memberships = [orgOwnerMembership],
  boardManagementService = createFakeBoardManagementService(),
) {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService(memberships),
    boardManagementService,
    checkDatabase: async () => true,
  });
}

function patchBoardRequest(boardId: string, body: Record<string, unknown>, cookie = sessionCookie) {
  return new Request(`http://localhost/api/admin/boards/${boardId}`, {
    method: "PATCH",
    headers: {
      cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function createBoardRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/boards", {
    method: "POST",
    headers: {
      cookie: sessionCookie,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("admin board update route", () => {
  test("org owner can update managed board metadata", async () => {
    const boardManagementService = createFakeBoardManagementService();
    const app = createApp([orgOwnerMembership], boardManagementService);

    const response = await app.handle(
      patchBoardRequest(BOARD_A1, {
        name: "Renamed Board",
        description: "Updated description",
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { board: { name: string; description: string | null; displayVersion: number } };
    };
    expect(json.data.board.name).toBe("Renamed Board");
    expect(json.data.board.description).toBe("Updated description");
    expect(json.data.board.displayVersion).toBe(2);
  });

  test("venue manager can update assigned board", async () => {
    const app = createApp([venueManagerMembership]);

    const response = await app.handle(
      patchBoardRequest(BOARD_A1, {
        publicAddPolicy: "staff_only",
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { board: { publicAddPolicy: string; displayVersion: number } };
    };
    expect(json.data.board.publicAddPolicy).toBe("staff_only");
    expect(json.data.board.displayVersion).toBe(1);
  });

  test("venue staff cannot update board metadata", async () => {
    const app = createApp([venueStaffMembership]);

    const response = await app.handle(
      patchBoardRequest(BOARD_A1, {
        name: "Blocked Rename",
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

  test("inaccessible board returns 404", async () => {
    const app = createApp([venueManagerMembership]);

    const response = await app.handle(
      patchBoardRequest("00000000-0000-4000-8000-000000000201", {
        name: "Blocked Rename",
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "not_found", message: "Resource not found." },
    });
  });

  test("unknown board returns 404", async () => {
    const app = createApp([orgOwnerMembership]);

    const response = await app.handle(
      patchBoardRequest("00000000-0000-4000-8000-000000009999", {
        name: "Missing Board",
      }),
    );

    expect(response.status).toBe(404);
  });

  test("increments displayVersion only for display-visible changes", async () => {
    const boardManagementService = createFakeBoardManagementService();
    const app = createApp([orgOwnerMembership], boardManagementService);

    const displayVisibleResponse = await app.handle(
      patchBoardRequest(BOARD_A2, {
        name: "Display Visible Board Name",
      }),
    );
    const displayVisibleJson = (await displayVisibleResponse.json()) as {
      ok: true;
      data: { board: { displayVersion: number } };
    };
    expect(displayVisibleJson.data.board.displayVersion).toBe(2);

    const adminOnlyResponse = await app.handle(
      patchBoardRequest(BOARD_A1, {
        slug: "board-a1-renamed",
      }),
    );
    const adminOnlyJson = (await adminOnlyResponse.json()) as {
      ok: true;
      data: { board: { slug: string; displayVersion: number } };
    };
    expect(adminOnlyJson.data.board.slug).toBe("board-a1-renamed");
    expect(adminOnlyJson.data.board.displayVersion).toBe(1);
  });

  test("rejects empty patch", async () => {
    const app = createApp([orgOwnerMembership]);

    const response = await app.handle(patchBoardRequest(BOARD_A1, {}));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message: "At least one board field must be provided.",
      },
    });
  });

  test("rejects unknown/forbidden patch fields as empty", async () => {
    const app = createApp([orgOwnerMembership]);

    // Elysia strips unknown fields from the validated body; a patch containing
    // only unknown fields therefore arrives empty, triggering the empty-patch guard.
    const response = await app.handle(
      patchBoardRequest(BOARD_A1, {
        displayVersion: 99,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message: "At least one board field must be provided.",
      },
    });
  });

  test("duplicate slug returns validation_error", async () => {
    const boardManagementService = createFakeBoardManagementService();
    const app = createApp([orgOwnerMembership], boardManagementService);

    await app.handle(
      createBoardRequest({
        venueId: VENUE_A1,
        slug: "temp-board",
        publicSlug: "temp-board-public",
        name: "Temp Board",
      }),
    );

    const response = await app.handle(
      patchBoardRequest(BOARD_A1, {
        slug: "temp-board",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message: "A board with this slug already exists in the venue.",
      },
    });
  });

  test("returns 401 without a session cookie", async () => {
    const app = createApp();

    const response = await app.handle(patchBoardRequest(BOARD_A1, { name: "No Session" }, ""));

    expect(response.status).toBe(401);
  });
});
