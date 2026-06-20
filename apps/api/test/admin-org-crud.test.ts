import { describe, expect, test } from "bun:test";

import { createTestApp } from "../src/app";
import {
  createFakeAuthService,
  createFakeBoardManagementService,
  createFakeOrgManagementService,
  orgOwnerMembership,
  ORG_A,
  ORG_B,
  sessionCookie,
  venueManagerMembership,
  venueStaffMembership,
} from "./admin-fixtures";
import { testAppConfig } from "./test-config";

function createSuperAdminApp() {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService([], { isSuperAdmin: true }),
    boardManagementService: createFakeBoardManagementService(),
    orgManagementService: createFakeOrgManagementService(),
    checkDatabase: async () => true,
  });
}

function createOrgOwnerApp() {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService([orgOwnerMembership]),
    boardManagementService: createFakeBoardManagementService(),
    orgManagementService: createFakeOrgManagementService(),
    checkDatabase: async () => true,
  });
}

function createVenueManagerApp() {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService([venueManagerMembership]),
    boardManagementService: createFakeBoardManagementService(),
    orgManagementService: createFakeOrgManagementService(),
    checkDatabase: async () => true,
  });
}

describe("admin org create (POST /api/admin/organizations)", () => {
  test("super-admin can create an organization", async () => {
    const app = createSuperAdminApp();

    const response = await app.handle(
      new Request("http://localhost/api/admin/organizations", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ slug: "new-org", name: "New Org" }),
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { organization: { slug: string; name: string } };
    };
    expect(json.data.organization.slug).toBe("new-org");
    expect(json.data.organization.name).toBe("New Org");
  });

  test("non-super-admin gets 403 on create", async () => {
    const app = createOrgOwnerApp();

    const response = await app.handle(
      new Request("http://localhost/api/admin/organizations", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ slug: "new-org", name: "New Org" }),
      }),
    );

    expect(response.status).toBe(403);
    const json = (await response.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("forbidden");
  });

  test("venue manager gets 403 on create", async () => {
    const app = createVenueManagerApp();

    const response = await app.handle(
      new Request("http://localhost/api/admin/organizations", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ slug: "new-org", name: "New Org" }),
      }),
    );

    expect(response.status).toBe(403);
  });

  test("slug conflict returns 409", async () => {
    const app = createSuperAdminApp();

    const response = await app.handle(
      new Request("http://localhost/api/admin/organizations", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ slug: "org-a", name: "Duplicate" }),
      }),
    );

    expect(response.status).toBe(409);
    const json = (await response.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("conflict");
  });

  test("invalid slug returns 400", async () => {
    const app = createSuperAdminApp();

    const response = await app.handle(
      new Request("http://localhost/api/admin/organizations", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ slug: "INVALID SLUG!!!", name: "Bad" }),
      }),
    );

    expect(response.status).toBe(400);
    const json = (await response.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("validation_error");
  });

  test("returns 401 without session", async () => {
    const app = createSuperAdminApp();

    const response = await app.handle(
      new Request("http://localhost/api/admin/organizations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: "new-org", name: "New Org" }),
      }),
    );

    expect(response.status).toBe(401);
  });
});

describe("admin org update (PATCH /api/admin/organizations/:orgId)", () => {
  test("super-admin can update an organization", async () => {
    const app = createSuperAdminApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/organizations/${ORG_A}`, {
        method: "PATCH",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated Org A" }),
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { organization: { name: string } };
    };
    expect(json.data.organization.name).toBe("Updated Org A");
  });

  test("org owner can update their own organization", async () => {
    const app = createOrgOwnerApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/organizations/${ORG_A}`, {
        method: "PATCH",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated By Owner" }),
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { organization: { name: string } };
    };
    expect(json.data.organization.name).toBe("Updated By Owner");
  });

  test("org owner cannot update another org", async () => {
    const app = createOrgOwnerApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/organizations/${ORG_B}`, {
        method: "PATCH",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "Cross-tenant Update" }),
      }),
    );

    expect(response.status).toBe(403);
    const json = (await response.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("forbidden");
  });

  test("venue manager cannot update organization", async () => {
    const app = createVenueManagerApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/organizations/${ORG_A}`, {
        method: "PATCH",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "Blocked" }),
      }),
    );

    expect(response.status).toBe(403);
  });

  test("slug conflict on update returns 409", async () => {
    const app = createSuperAdminApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/organizations/${ORG_A}`, {
        method: "PATCH",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ slug: "org-b" }),
      }),
    );

    expect(response.status).toBe(409);
    const json = (await response.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("conflict");
  });

  test("update non-existent org returns 404", async () => {
    const app = createSuperAdminApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/organizations/00000000-0000-4000-8000-000000000999`, {
        method: "PATCH",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "Ghost" }),
      }),
    );

    expect(response.status).toBe(404);
  });

  test("empty patch body returns 400", async () => {
    const app = createSuperAdminApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/organizations/${ORG_A}`, {
        method: "PATCH",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe("admin org delete (DELETE /api/admin/organizations/:orgId)", () => {
  test("super-admin can delete an empty organization", async () => {
    // ORG_A has no venues in the fake (only ORG_B is marked non-empty)
    // Actually wait: the fake marks ORG_B as non-empty. ORG_A can be deleted.
    // But ORG_A has venues in the fixture... the fake only checks ORG_B.
    // For a cleaner test, we need to delete a truly empty org.
    // Let's create a new org then delete it.
    const orgMgmt = createFakeOrgManagementService([
      {
        id: "00000000-0000-4000-8000-000000000099",
        slug: "empty-org",
        name: "Empty Org",
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ]);
    const app = createTestApp({
      config: testAppConfig,
      adminAuthService: createFakeAuthService([], { isSuperAdmin: true }),
      boardManagementService: createFakeBoardManagementService(),
      orgManagementService: orgMgmt,
      checkDatabase: async () => true,
    });

    const response = await app.handle(
      new Request(`http://localhost/api/admin/organizations/00000000-0000-4000-8000-000000000099`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: true; data: { deleted: true } };
    expect(json.data.deleted).toBe(true);
  });

  test("delete refuses non-empty organization", async () => {
    const app = createSuperAdminApp();

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

  test("non-super-admin gets 403 on delete", async () => {
    const app = createOrgOwnerApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/organizations/${ORG_A}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(403);
    const json = (await response.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("forbidden");
  });

  test("venue staff gets 403 on delete", async () => {
    const app = createTestApp({
      config: testAppConfig,
      adminAuthService: createFakeAuthService([venueStaffMembership]),
      boardManagementService: createFakeBoardManagementService(),
      orgManagementService: createFakeOrgManagementService(),
      checkDatabase: async () => true,
    });

    const response = await app.handle(
      new Request(`http://localhost/api/admin/organizations/${ORG_A}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(403);
  });

  test("delete non-existent org returns 404", async () => {
    const app = createSuperAdminApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/organizations/00000000-0000-4000-8000-000000000999`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(404);
  });

  test("returns 401 without session on delete", async () => {
    const app = createSuperAdminApp();

    const response = await app.handle(
      new Request(`http://localhost/api/admin/organizations/${ORG_A}`, {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(401);
  });
});
