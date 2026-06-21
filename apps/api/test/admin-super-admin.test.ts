import { describe, expect, test } from "bun:test";

import { createTestApp } from "../src/app";
import {
  BOARD_A1,
  BOARD_A2,
  BOARD_B1,
  createFakeAuthService,
  createFakeBoardManagementService,
  createFakeOrgManagementService,
  createFakeVenueManagementService,
  ORG_B,
  organizationsFixture,
  sessionCookie,
  VENUE_A1,
  venuesFixture,
} from "./admin-fixtures";
import { testAppConfig } from "./test-config";

// Super-admin bypasses tenant resource scope only.
// Validation, delete guards, CSRF, rate limits, and audit requirements still apply.

function createSuperAdminApp() {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService([], { isSuperAdmin: true }),
    boardManagementService: createFakeBoardManagementService(),
    venueManagementService: createFakeVenueManagementService(),
    checkDatabase: async () => true,
  });
}

function createRegularApp() {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService([]),
    boardManagementService: createFakeBoardManagementService(),
    venueManagementService: createFakeVenueManagementService(),
    checkDatabase: async () => true,
  });
}

describe("super-admin route propagation", () => {
  test("super-admin with no memberships can list all organizations", async () => {
    const app = createSuperAdminApp();

    const response = await app.handle(
      new Request("http://localhost/api/admin/organizations", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { organizations: Array<{ id: string }> };
    };
    expect(json.data.organizations.map((o) => o.id).sort()).toEqual(
      organizationsFixture.map((o) => o.id).sort(),
    );
  });

  test("super-admin with no memberships can list all venues", async () => {
    const app = createSuperAdminApp();

    const response = await app.handle(
      new Request("http://localhost/api/admin/venues", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { venues: Array<{ id: string }> };
    };
    expect(json.data.venues.map((v) => v.id).sort()).toEqual(venuesFixture.map((v) => v.id).sort());
  });

  test("super-admin with no memberships can list all boards", async () => {
    const app = createSuperAdminApp();

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
    const ids = json.data.boards.map((b) => b.id).sort();
    expect(ids).toEqual([BOARD_A1, BOARD_A2, BOARD_B1].sort());
  });

  test("super-admin with no memberships can read a board in any org", async () => {
    const app = createSuperAdminApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_B1}`, {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: true; data: { board: { id: string } } };
    expect(json.data.board.id).toBe(BOARD_B1);
  });

  test("super-admin can manage (patch) a board they have no membership for", async () => {
    const app = createSuperAdminApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_B1}`, {
        method: "PATCH",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated Board B1" }),
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: true; data: { board: { name: string } } };
    expect(json.data.board.name).toBe("Updated Board B1");
  });

  test("super-admin can operate (open) a board they have no membership for", async () => {
    const app = createSuperAdminApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_B1}/open`, {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: true; data: { board: { status: string } } };
    expect(json.data.board.status).toBe("open");
  });

  test("super-admin can delete a board they have no membership for", async () => {
    const app = createSuperAdminApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_B1}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: true; data: { deleted: true } };
    expect(json.data.deleted).toBe(true);
  });

  test("existing non-super-admin membership behavior is unchanged", async () => {
    const app = createRegularApp();

    const response = await app.handle(
      new Request("http://localhost/api/admin/boards", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: true; data: { boards: Array<{ id: string }> } };
    // No memberships → no boards visible
    expect(json.data.boards).toEqual([]);
  });

  test("super-admin still receives validation error for invalid slug in board patch", async () => {
    const app = createSuperAdminApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/boards/${BOARD_A1}`, {
        method: "PATCH",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        // Slug with uppercase is invalid per validateSlug
        body: JSON.stringify({ slug: "INVALID SLUG!!!" }),
      }),
    );

    expect(response.status).toBe(400);
    const json = (await response.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("validation_error");
  });
});

// Super-admin scope bypass only applies to tenant resource visibility.
// Delete guards (not_empty, has_boards) are enforced independently and
// cannot be bypassed by the super-admin flag.
describe("super-admin delete guards — scope bypass does not override content guards", () => {
  test("super-admin cannot delete an org that still has venues — gets 400", async () => {
    const app = createTestApp({
      config: testAppConfig,
      adminAuthService: createFakeAuthService([], { isSuperAdmin: true }),
      boardManagementService: createFakeBoardManagementService(),
      orgManagementService: createFakeOrgManagementService(),
      checkDatabase: async () => true,
    });

    const response = await app.handle(
      new Request(`http://localhost/api/admin/organizations/${ORG_B}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(400);
    const json = (await response.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("validation_error");
  });

  test("super-admin cannot delete a venue that still has boards — gets 400", async () => {
    const app = createTestApp({
      config: testAppConfig,
      adminAuthService: createFakeAuthService([], { isSuperAdmin: true }),
      boardManagementService: createFakeBoardManagementService(),
      venueManagementService: createFakeVenueManagementService(
        venuesFixture.map((v) => ({ ...v })),
        new Set([VENUE_A1]),
      ),
      checkDatabase: async () => true,
    });

    const response = await app.handle(
      new Request(`http://localhost/api/admin/venues/${VENUE_A1}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(400);
    const json = (await response.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("validation_error");
  });
});
