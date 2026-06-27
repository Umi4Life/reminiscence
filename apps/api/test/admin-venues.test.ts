import { describe, expect, test } from "bun:test";

import { createTestApp } from "../src/app";
import {
  createFakeAuthService,
  createFakeBoardManagementService,
  createFakeVenueManagementService,
  orgOwnerMembership,
  ORG_A,
  sessionCookie,
  VENUE_A1,
  VENUE_A2,
  venueManagerMembership,
  venueStaffMembership,
} from "./admin-fixtures";
import { testAppConfig } from "./test-config";

function createApp(memberships = [orgOwnerMembership], options: { isSuperAdmin?: boolean } = {}) {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService(memberships, options),
    boardManagementService: createFakeBoardManagementService(),
    venueManagementService: createFakeVenueManagementService(),
    checkDatabase: async () => true,
  });
}

describe("admin venues routes", () => {
  // --- list ---

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
    expect(await response.json()).toEqual({ ok: true, data: { venues: [], nextCursor: null } });
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

  // --- get ---

  test("org owner can get a venue by id", async () => {
    const app = createApp([orgOwnerMembership]);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/venues/${VENUE_A1}`, {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: true; data: { venue: { id: string } } };
    expect(json.data.venue.id).toBe(VENUE_A1);
  });

  test("returns 404 for unknown venue id", async () => {
    const app = createApp([orgOwnerMembership]);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/venues/00000000-0000-4000-8000-000000000999`, {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(404);
  });

  // --- create ---

  test("org owner can create a venue", async () => {
    const app = createApp([orgOwnerMembership]);

    const response = await app.handle(
      new Request("http://localhost/api/admin/venues", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({
          organizationId: ORG_A,
          slug: "new-venue",
          name: "New Venue",
          timezone: "Asia/Bangkok",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: true; data: { venue: { slug: string } } };
    expect(json.data.venue.slug).toBe("new-venue");
  });

  test("venue manager cannot create a venue — gets 403", async () => {
    const app = createApp([venueManagerMembership]);

    const response = await app.handle(
      new Request("http://localhost/api/admin/venues", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({
          organizationId: ORG_A,
          slug: "new-venue",
          name: "New Venue",
          timezone: "Asia/Bangkok",
        }),
      }),
    );

    expect(response.status).toBe(403);
  });

  test("venue staff cannot create a venue — gets 403", async () => {
    const app = createApp([venueStaffMembership]);

    const response = await app.handle(
      new Request("http://localhost/api/admin/venues", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({
          organizationId: ORG_A,
          slug: "new-venue",
          name: "New Venue",
          timezone: "Asia/Bangkok",
        }),
      }),
    );

    expect(response.status).toBe(403);
  });

  test("create rejects invalid timezone", async () => {
    const app = createApp([orgOwnerMembership]);

    const response = await app.handle(
      new Request("http://localhost/api/admin/venues", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({
          organizationId: ORG_A,
          slug: "new-venue",
          name: "New Venue",
          timezone: "Not/A/Timezone",
        }),
      }),
    );

    expect(response.status).toBe(400);
    const json = (await response.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("validation_error");
  });

  test("create rejects duplicate slug", async () => {
    const app = createApp([orgOwnerMembership]);

    const response = await app.handle(
      new Request("http://localhost/api/admin/venues", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({
          organizationId: ORG_A,
          slug: "venue-a1",
          name: "Duplicate Venue",
          timezone: "Asia/Bangkok",
        }),
      }),
    );

    expect(response.status).toBe(400);
    const json = (await response.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("validation_error");
  });

  // --- update ---

  test("org owner can update a venue", async () => {
    const app = createApp([orgOwnerMembership]);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/venues/${VENUE_A1}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({ name: "Updated Name" }),
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: true; data: { venue: { name: string } } };
    expect(json.data.venue.name).toBe("Updated Name");
  });

  test("venue manager cannot update a venue — gets 403", async () => {
    const app = createApp([venueManagerMembership]);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/venues/${VENUE_A1}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({ name: "Updated Name" }),
      }),
    );

    expect(response.status).toBe(403);
  });

  test("venue staff cannot update a venue — gets 403", async () => {
    const app = createApp([venueStaffMembership]);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/venues/${VENUE_A1}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({ name: "Updated Name" }),
      }),
    );

    expect(response.status).toBe(403);
  });

  test("update rejects invalid timezone", async () => {
    const app = createApp([orgOwnerMembership]);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/venues/${VENUE_A1}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({ timezone: "Fake/Zone" }),
      }),
    );

    expect(response.status).toBe(400);
  });

  // --- delete ---

  test("org owner can delete a venue", async () => {
    const app = createApp([orgOwnerMembership]);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/venues/${VENUE_A2}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: true; data: { deleted: boolean } };
    expect(json.data.deleted).toBe(true);
  });

  test("venue manager cannot delete a venue — gets 403", async () => {
    const app = createApp([venueManagerMembership]);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/venues/${VENUE_A1}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(403);
  });

  test("venue staff cannot delete a venue — gets 403", async () => {
    const app = createApp([venueStaffMembership]);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/venues/${VENUE_A1}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(403);
  });

  test("delete returns 400 when venue has existing boards", async () => {
    const venueService = createFakeVenueManagementService(undefined, new Set([VENUE_A1]));
    const app = createTestApp({
      config: testAppConfig,
      adminAuthService: createFakeAuthService([orgOwnerMembership]),
      boardManagementService: createFakeBoardManagementService(),
      venueManagementService: venueService,
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
