import { describe, expect, test } from "bun:test";

import type { BoardAccessService } from "../src/access/board-access";
import { createTestApp } from "../src/app";
import {
  boardsFixture,
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

const fakeCredential = {
  id: "credential-1",
  accessUrl: "http://localhost:3000/q/initial-token",
  tokenPreview: "initial-…",
  version: 1,
  expiresAt: null,
};

function createFakeBoardAccessService(
  boardManagementService: ReturnType<typeof createFakeBoardManagementService>,
): BoardAccessService {
  return {
    async rotateBoardAccessCredential(_rbac, _adminUserId, boardId) {
      // Look up the board from the shared management service state (handles newly created boards)
      const board = boardManagementService.boards.find((b) => b.id === boardId) ?? {
        ...boardsFixture[0]!,
        id: boardId,
      };
      return {
        status: "rotated",
        board: { ...board, displayVersion: board.displayVersion + 1 },
        credential: fakeCredential,
      };
    },
    async getActiveBoardCredential() {
      return { status: "active", credential: fakeCredential };
    },
  };
}

function createApp(
  memberships = [orgOwnerMembership],
  boardManagementService = createFakeBoardManagementService(),
  boardAccessService = createFakeBoardAccessService(boardManagementService),
) {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService(memberships),
    boardManagementService,
    boardAccessService,
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
  test("org owner can create a board and receives initial QR credential", async () => {
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
        credential: {
          id: string;
          accessUrl: string;
          tokenPreview: string;
          version: number;
          expiresAt: null;
        };
      };
    };

    expect(json.data.board.venueId).toBe(VENUE_A1);
    expect(json.data.board.slug).toBe("new-board");
    expect(json.data.board.publicSlug).toBe("new-board-public");
    expect(json.data.board.name).toBe("New Board");
    expect(json.data.board.status).toBe("open");
    expect(json.data.board.publicViewPolicy).toBe("open");
    expect(json.data.board.publicAddPolicy).toBe("access_code_required");
    expect(json.data.board.publicRemovePolicy).toBe("access_code_required");
    expect(json.data.board.qrRotationPolicy).toBe("manual");
    expect(boardManagementService.boards.length).toBe(4);

    // Initial QR credential is returned without a separate rotate call
    expect(json.data.credential.id).toBe("credential-1");
    expect(json.data.credential.accessUrl).toBe("http://localhost:3000/q/initial-token");
    expect(json.data.credential.tokenPreview).toBe("initial-…");
    expect(json.data.credential.version).toBe(1);
    expect(json.data.credential.expiresAt).toBe(null);
  });

  test("venue manager can create a board in assigned venue", async () => {
    const app = createApp([venueManagerMembership]);

    const response = await app.handle(createBoardRequest(validCreateBody));

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { board: { venueId: string }; credential: { version: number } };
    };
    expect(json.data.board.venueId).toBe(VENUE_A1);
    expect(json.data.credential.version).toBe(1);
  });

  test("board create response includes credential; rotate replaces it (QR lifecycle contract)", async () => {
    // 1. Create board → credential at version 1
    const boardManagementService = createFakeBoardManagementService();
    const rotateCalls: string[] = [];
    const accessService: BoardAccessService = {
      async rotateBoardAccessCredential(_rbac, _adminUserId, boardId) {
        rotateCalls.push(boardId);
        const version = rotateCalls.filter((id) => id === boardId).length;
        return {
          status: "rotated",
          board: { ...boardsFixture[0]!, id: boardId, displayVersion: version + 1 },
          credential: {
            id: `credential-${version}`,
            accessUrl: `http://localhost:3000/q/token-v${version}`,
            tokenPreview: `token-v${version}…`,
            version,
            expiresAt: null,
          },
        };
      },
      async getActiveBoardCredential() {
        return { status: "none" };
      },
    };
    const app = createApp([orgOwnerMembership], boardManagementService, accessService);

    const createRes = await app.handle(createBoardRequest(validCreateBody));
    expect(createRes.status).toBe(200);
    const createJson = (await createRes.json()) as {
      ok: true;
      data: { credential: { version: number; accessUrl: string } };
    };
    expect(createJson.data.credential.version).toBe(1);
    expect(createJson.data.credential.accessUrl).toBe("http://localhost:3000/q/token-v1");

    // rotate call count after create = 1 (initial credential)
    const createdBoardId = rotateCalls[0];
    expect(rotateCalls.length).toBe(1);

    // 2. Rotate again → version 2 (explicit security action)
    const rotateRes = await app.handle(
      new Request(`http://localhost/api/admin/boards/${createdBoardId}/access-credentials/rotate`, {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );
    expect(rotateRes.status).toBe(200);
    const rotateJson = (await rotateRes.json()) as {
      ok: true;
      data: { credential: { version: number } };
    };
    expect(rotateJson.data.credential.version).toBe(2);
    expect(rotateCalls.length).toBe(2);
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
        message: "Slug must contain only lowercase URL-safe characters.",
      },
    });
  });

  test("returns 401 without a session cookie", async () => {
    const app = createApp();

    const response = await app.handle(createBoardRequest(validCreateBody, ""));

    expect(response.status).toBe(401);
  });
});
