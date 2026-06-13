import { describe, expect, test } from "bun:test";

import { createTestApp } from "../src/app";
import {
  createFakeAuthService,
  createFakeBoardManagementService,
  orgOwnerMembership,
  sessionCookie,
  VENUE_A1,
  VENUE_A2,
  venueManagerMembership,
  venueStaffMembership,
} from "./admin-fixtures";
import { testAppConfig } from "./test-config";

function createApp(memberships = [orgOwnerMembership]) {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService(memberships),
    boardManagementService: createFakeBoardManagementService(),
    checkDatabase: async () => true,
  });
}

describe("admin venues routes", () => {
  test("org owner sees all venues in owned organizations", async () => {
    const app = createApp([orgOwnerMembership]);

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
    expect(json.data.venues.map((venue) => venue.id).sort()).toEqual([VENUE_A1, VENUE_A2].sort());
  });

  test("venue manager sees only assigned venues", async () => {
    const app = createApp([venueManagerMembership]);

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
    expect(json.data.venues.length).toBe(1);
    expect(json.data.venues[0]?.id).toBe(VENUE_A1);
  });

  test("venue staff sees only assigned venues", async () => {
    const app = createApp([venueStaffMembership]);

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
    expect(json.data.venues.length).toBe(1);
    expect(json.data.venues[0]?.id).toBe(VENUE_A1);
  });

  test("returns empty list for admin with no memberships", async () => {
    const app = createApp([]);

    const response = await app.handle(
      new Request("http://localhost/api/admin/venues", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { venues: [] } });
  });

  test("does not leak unassigned venues to venue manager", async () => {
    const app = createApp([venueManagerMembership]);

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
    expect(json.data.venues.some((venue) => venue.id === VENUE_A2)).toBe(false);
  });

  test("returns 401 without a session cookie", async () => {
    const app = createApp();

    const response = await app.handle(new Request("http://localhost/api/admin/venues"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "Authentication required." },
    });
  });
});
