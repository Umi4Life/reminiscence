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

function superAdminApp() {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService([], { isSuperAdmin: true }),
    boardManagementService: createFakeBoardManagementService(),
    orgManagementService: createFakeOrgManagementService(),
    checkDatabase: async () => true,
  });
}

type OrgListData = {
  organizations: Array<{ id: string; name: string; slug: string }>;
  nextCursor: string | null;
  loaded: number;
};

function createApp(memberships = [orgOwnerMembership]) {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService(memberships),
    boardManagementService: createFakeBoardManagementService(),
    orgManagementService: createFakeOrgManagementService(),
    checkDatabase: async () => true,
  });
}

describe("admin organizations routes", () => {
  test("returns organizations scoped to memberships for org owner", async () => {
    const app = createApp([orgOwnerMembership]);

    const response = await app.handle(
      new Request("http://localhost/api/admin/organizations", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: true;
      data: { organizations: Array<{ id: string; slug: string; name: string }> };
    };
    expect(json.data.organizations[0]?.id).toBe(ORG_A);
    expect(json.data.organizations[0]?.slug).toBe("org-a");
    expect(json.data.organizations[0]?.name).toBe("Organization A");
  });

  test("returns organization context for venue manager", async () => {
    const app = createApp([venueManagerMembership]);

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
    expect(json.data.organizations.length).toBe(1);
    expect(json.data.organizations[0]?.id).toBe(ORG_A);
  });

  test("returns empty list for admin with no memberships", async () => {
    const app = createApp([]);

    const response = await app.handle(
      new Request("http://localhost/api/admin/organizations", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { organizations: [], nextCursor: null, loaded: 0 },
    });
  });

  test("does not leak inaccessible organizations", async () => {
    const app = createApp([venueStaffMembership]);

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
    expect(json.data.organizations.some((org) => org.id === ORG_B)).toBe(false);
  });

  test("returns 401 without a session cookie", async () => {
    const app = createApp();

    const response = await app.handle(new Request("http://localhost/api/admin/organizations"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "Authentication required." },
    });
  });

  describe("search", () => {
    test("filters by organization name (case-insensitive)", async () => {
      const app = superAdminApp();

      const response = await app.handle(
        new Request("http://localhost/api/admin/organizations?search=organization+a", {
          headers: { cookie: sessionCookie },
        }),
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as { ok: true; data: OrgListData };
      expect(json.data.organizations.length).toBe(1);
      expect(json.data.organizations[0]?.id).toBe(ORG_A);
      expect(json.data.loaded).toBe(1);
    });

    test("filters by organization slug (case-insensitive)", async () => {
      const app = superAdminApp();

      const response = await app.handle(
        new Request("http://localhost/api/admin/organizations?search=ORG-B", {
          headers: { cookie: sessionCookie },
        }),
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as { ok: true; data: OrgListData };
      expect(json.data.organizations.length).toBe(1);
      expect(json.data.organizations[0]?.id).toBe(ORG_B);
    });

    test("returns empty list when no matches", async () => {
      const app = superAdminApp();

      const response = await app.handle(
        new Request("http://localhost/api/admin/organizations?search=nonexistent-xyz", {
          headers: { cookie: sessionCookie },
        }),
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as { ok: true; data: OrgListData };
      expect(json.data.organizations).toEqual([]);
      expect(json.data.nextCursor).toBeNull();
      expect(json.data.loaded).toBe(0);
    });

    test("scoping still applies with search for non-super-admin", async () => {
      const app = createApp([orgOwnerMembership]);

      const response = await app.handle(
        new Request("http://localhost/api/admin/organizations?search=org", {
          headers: { cookie: sessionCookie },
        }),
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as { ok: true; data: OrgListData };
      expect(json.data.organizations.some((o) => o.id === ORG_B)).toBe(false);
      expect(json.data.organizations[0]?.id).toBe(ORG_A);
    });
  });

  describe("sort", () => {
    test("name_asc returns organizations sorted by name ascending", async () => {
      const app = superAdminApp();

      const response = await app.handle(
        new Request("http://localhost/api/admin/organizations?sort=name_asc", {
          headers: { cookie: sessionCookie },
        }),
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as { ok: true; data: OrgListData };
      const names = json.data.organizations.map((o) => o.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
      expect(json.data.organizations[0]?.id).toBe(ORG_A);
    });

    test("name_asc pagination: cursor carries to next page", async () => {
      const app = superAdminApp();

      const first = await app.handle(
        new Request("http://localhost/api/admin/organizations?sort=name_asc&limit=1", {
          headers: { cookie: sessionCookie },
        }),
      );
      expect(first.status).toBe(200);
      const firstJson = (await first.json()) as { ok: true; data: OrgListData };
      expect(firstJson.data.organizations.length).toBe(1);
      expect(firstJson.data.nextCursor).not.toBeNull();

      const second = await app.handle(
        new Request(
          `http://localhost/api/admin/organizations?sort=name_asc&limit=1&cursor=${firstJson.data.nextCursor}`,
          { headers: { cookie: sessionCookie } },
        ),
      );
      expect(second.status).toBe(200);
      const secondJson = (await second.json()) as { ok: true; data: OrgListData };
      expect(secondJson.data.organizations.length).toBe(1);
      expect(secondJson.data.organizations[0]?.id).not.toBe(firstJson.data.organizations[0]?.id);
      expect(secondJson.data.nextCursor).toBeNull();
    });

    test("search combined with sort=name_asc", async () => {
      const app = superAdminApp();

      const response = await app.handle(
        new Request("http://localhost/api/admin/organizations?sort=name_asc&search=org", {
          headers: { cookie: sessionCookie },
        }),
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as { ok: true; data: OrgListData };
      expect(json.data.organizations.length).toBe(2);
      const names = json.data.organizations.map((o) => o.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });
  });
});
