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
      data: { organizations: [], nextCursor: null },
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
});
