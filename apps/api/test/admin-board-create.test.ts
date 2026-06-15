import { describe, expect, test } from "bun:test";

import { createTestApp } from "../src/app";
import {
  createFakeAuthService,
  createFakeBoardManagementService,
  orgOwnerMembership,
  sessionCookie,
  VENUE_A1,
  VENUE_B1,
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

function createBoardRequest(body: Record<string, unknown>, cookie = sessionCookie) {
  return new Request("http://localhost/api/admin/boards", {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const validCreateBody = {
  venueId: VENUE_A1,
  slug: "new-board",
  publicSlug: "new-board-public",
  name: "New Board",
};

describe("admin board create route", () => {
  test("org owner can create a board in any owned-org venue", async () => {
    const boardManagementService = createFakeBoardManagementService();
    const app = createApp([orgOwnerMembership], boardManagementService);

    const response = await app.handle(createBoardRequest(validCreateBody));

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: {
        board: {
          venueId: string;
          slug: string;
          publicSlug: string;
          name: string;
          status: string;
          publicViewPolicy: string;
          publicAddPolicy: string;
          publicRemovePolicy: string;
          qrRotationPolicy: string;
        };
      };
    };

    expect(json.data.board.venueId).toBe(VENUE_A1);
    expect(json.data.board.slug).toBe("new-board");
    expect(json.data.board.publicSlug).toBe("new-board-public");
    expect(json.data.board.name).toBe("New Board");
    expect(json.data.board.status).toBe("closed");
    expect(json.data.board.publicViewPolicy).toBe("open");
    expect(json.data.board.publicAddPolicy).toBe("access_code_required");
    expect(json.data.board.publicRemovePolicy).toBe("access_code_required");
    expect(json.data.board.qrRotationPolicy).toBe("manual");
    expect(boardManagementService.boards.length).toBe(4);
  });

  test("venue manager can create a board in assigned venue", async () => {
    const app = createApp([venueManagerMembership]);

    const response = await app.handle(createBoardRequest(validCreateBody));

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: true; data: { board: { venueId: string } } };
    expect(json.data.board.venueId).toBe(VENUE_A1);
  });

  test("venue staff cannot create boards", async () => {
    const app = createApp([venueStaffMembership]);

    const response = await app.handle(createBoardRequest(validCreateBody));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "forbidden",
        message: "You do not have permission to perform this action.",
      },
    });
  });

  test("inaccessible venue returns 404 to avoid existence leak", async () => {
    const app = createApp([venueManagerMembership]);

    const response = await app.handle(
      createBoardRequest({
        ...validCreateBody,
        venueId: VENUE_B1,
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "not_found", message: "Resource not found." },
    });
  });

  test("unknown venue returns 404", async () => {
    const app = createApp([orgOwnerMembership]);

    const response = await app.handle(
      createBoardRequest({
        ...validCreateBody,
        venueId: "00000000-0000-4000-8000-000000009999",
      }),
    );

    expect(response.status).toBe(404);
  });

  test("duplicate venue slug returns validation_error", async () => {
    const app = createApp([orgOwnerMembership]);

    const response = await app.handle(
      createBoardRequest({
        ...validCreateBody,
        slug: "board-a1",
        publicSlug: "unique-public-slug",
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

  test("duplicate public slug returns validation_error", async () => {
    const app = createApp([orgOwnerMembership]);

    const response = await app.handle(
      createBoardRequest({
        ...validCreateBody,
        slug: "unique-slug",
        publicSlug: "board-a1-public",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message: "A board with this public slug already exists.",
      },
    });
  });

  test("invalid body returns validation_error", async () => {
    const app = createApp([orgOwnerMembership]);

    const response = await app.handle(
      createBoardRequest({
        venueId: VENUE_A1,
        slug: "INVALID",
        publicSlug: "new-board-public",
        name: "New Board",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message: "Invalid request format.",
      },
    });
  });

  test("returns 401 without a session cookie", async () => {
    const app = createApp();

    const response = await app.handle(createBoardRequest(validCreateBody, ""));

    expect(response.status).toBe(401);
  });
});
