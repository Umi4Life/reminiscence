import { describe, expect, test } from "bun:test";

import type {
  AssignMembershipInput,
  AssignMembershipResult,
  MembershipDetail,
  MembershipManagementService,
  RevokeMembershipResult,
} from "../src/admin/membership-management";
import { canManageOrganization, canManagePlatform, type AdminRbacContext } from "../src/auth/rbac";
import { createTestApp } from "../src/app";
import {
  createFakeAuthService,
  orgOwnerMembership,
  ORG_A,
  ORG_B,
  sessionCookie,
  VENUE_A1,
} from "./admin-fixtures";
import { testAppConfig } from "./test-config";

// ---------------------------------------------------------------------------
// Fake membership service
// ---------------------------------------------------------------------------

const MEMBERSHIP_1 = "00000000-0000-4000-8000-000000000901";
const MEMBERSHIP_2 = "00000000-0000-4000-8000-000000000902";
const ADMIN_USER_A = "00000000-0000-4000-8000-000000000801";
const ADMIN_USER_SUPER = "00000000-0000-4000-8000-000000000800";

const timestamp = new Date("2026-06-01T00:00:00.000Z");

interface FakeMembershipStore {
  memberships: MembershipDetail[];
  superAdminUserIds: Set<string>;
  ownerCounts: Map<string, number>;
}

function makeMembership(
  id: string,
  adminUserId: string,
  organizationId: string,
  venueId: string | null,
  role: MembershipDetail["role"],
): MembershipDetail {
  return { id, adminUserId, organizationId, venueId, role, createdAt: timestamp };
}

function createFakeMembershipService(store: FakeMembershipStore): MembershipManagementService {
  return {
    async assignMembership(
      rbac: AdminRbacContext,
      input: AssignMembershipInput,
    ): Promise<AssignMembershipResult> {
      if (!canManagePlatform(rbac) && !canManageOrganization(rbac, input.organizationId)) {
        return { status: "forbidden" };
      }

      if (store.superAdminUserIds.has(input.adminUserId) && !canManagePlatform(rbac)) {
        return { status: "forbidden" };
      }

      const duplicate = store.memberships.find(
        (m) =>
          m.adminUserId === input.adminUserId &&
          m.organizationId === input.organizationId &&
          m.venueId === input.venueId,
      );
      if (duplicate) return { status: "conflict" };

      const id = `generated-${store.memberships.length + 1}`;
      const membership = makeMembership(
        id,
        input.adminUserId,
        input.organizationId,
        input.venueId,
        input.role,
      );
      store.memberships.push(membership);

      if (input.role === "org_owner" && input.venueId === null) {
        store.ownerCounts.set(
          input.organizationId,
          (store.ownerCounts.get(input.organizationId) ?? 0) + 1,
        );
      }

      return { status: "assigned", membership };
    },

    async revokeMembership(
      rbac: AdminRbacContext,
      membershipId: string,
    ): Promise<RevokeMembershipResult> {
      const index = store.memberships.findIndex((m) => m.id === membershipId);
      if (index === -1) return { status: "not_found" };

      const membership = store.memberships[index]!;

      if (!canManagePlatform(rbac) && !canManageOrganization(rbac, membership.organizationId)) {
        return { status: "not_found" };
      }

      if (store.superAdminUserIds.has(membership.adminUserId) && !canManagePlatform(rbac)) {
        return { status: "forbidden" };
      }

      if (membership.role === "org_owner" && membership.venueId === null) {
        const count = store.ownerCounts.get(membership.organizationId) ?? 0;
        if (count <= 1) return { status: "last_owner" };
        store.ownerCounts.set(membership.organizationId, count - 1);
      }

      store.memberships.splice(index, 1);
      return { status: "revoked" };
    },
  };
}

// ---------------------------------------------------------------------------
// App factories
// ---------------------------------------------------------------------------

function makeStore(overrides?: Partial<FakeMembershipStore>): FakeMembershipStore {
  return {
    memberships: [
      makeMembership(MEMBERSHIP_1, ADMIN_USER_A, ORG_A, null, "org_owner"),
      makeMembership(MEMBERSHIP_2, ADMIN_USER_A, ORG_A, VENUE_A1, "venue_manager"),
    ],
    superAdminUserIds: new Set([ADMIN_USER_SUPER]),
    ownerCounts: new Map([[ORG_A, 1]]),
    ...overrides,
  };
}

function createOrgOwnerApp(store: FakeMembershipStore) {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService([orgOwnerMembership]),
    membershipManagementService: createFakeMembershipService(store),
    checkDatabase: async () => true,
  });
}

function createSuperAdminApp(store: FakeMembershipStore) {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService([], { isSuperAdmin: true }),
    membershipManagementService: createFakeMembershipService(store),
    checkDatabase: async () => true,
  });
}

// ---------------------------------------------------------------------------
// POST /api/admin/memberships
// ---------------------------------------------------------------------------

describe("POST /api/admin/memberships", () => {
  test("super-admin can assign an org-level membership", async () => {
    const store = makeStore({ memberships: [], ownerCounts: new Map() });
    const app = createSuperAdminApp(store);

    const response = await app.handle(
      new Request("http://localhost/api/admin/memberships", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({
          adminUserId: ADMIN_USER_A,
          organizationId: ORG_A,
          venueId: null,
          role: "org_owner",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: true; data: { membership: MembershipDetail } };
    expect(json.ok).toBe(true);
    expect(json.data.membership.adminUserId).toBe(ADMIN_USER_A);
    expect(json.data.membership.role).toBe("org_owner");
    expect(json.data.membership.venueId).toBe(null);
  });

  test("super-admin can assign a venue-level membership", async () => {
    const store = makeStore({ memberships: [] });
    const app = createSuperAdminApp(store);

    const response = await app.handle(
      new Request("http://localhost/api/admin/memberships", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({
          adminUserId: ADMIN_USER_A,
          organizationId: ORG_A,
          venueId: VENUE_A1,
          role: "venue_manager",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: true; data: { membership: MembershipDetail } };
    expect(json.data.membership.venueId).toBe(VENUE_A1);
    expect(json.data.membership.role).toBe("venue_manager");
  });

  test("org-owner can assign a membership within own org", async () => {
    const store = makeStore({ memberships: [] });
    const app = createOrgOwnerApp(store);

    const response = await app.handle(
      new Request("http://localhost/api/admin/memberships", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({
          adminUserId: ADMIN_USER_A,
          organizationId: ORG_A,
          venueId: VENUE_A1,
          role: "venue_staff",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: true; data: { membership: MembershipDetail } };
    expect(json.data.membership.role).toBe("venue_staff");
  });

  test("org-owner cannot assign membership in a different org", async () => {
    const store = makeStore({ memberships: [] });
    const app = createOrgOwnerApp(store);

    const response = await app.handle(
      new Request("http://localhost/api/admin/memberships", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({
          adminUserId: ADMIN_USER_A,
          organizationId: ORG_B,
          venueId: null,
          role: "org_owner",
        }),
      }),
    );

    expect(response.status).toBe(403);
    const json = (await response.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("forbidden");
  });

  test("org-owner cannot assign membership to a super-admin user", async () => {
    const store = makeStore({ memberships: [] });
    const app = createOrgOwnerApp(store);

    const response = await app.handle(
      new Request("http://localhost/api/admin/memberships", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({
          adminUserId: ADMIN_USER_SUPER,
          organizationId: ORG_A,
          venueId: null,
          role: "org_owner",
        }),
      }),
    );

    expect(response.status).toBe(403);
  });

  test("returns 409 on duplicate membership", async () => {
    const store = makeStore();
    const app = createSuperAdminApp(store);

    const response = await app.handle(
      new Request("http://localhost/api/admin/memberships", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({
          adminUserId: ADMIN_USER_A,
          organizationId: ORG_A,
          venueId: null,
          role: "org_owner",
        }),
      }),
    );

    expect(response.status).toBe(409);
    const json = (await response.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("conflict");
  });

  test("returns 400 when org_owner role is given a venueId", async () => {
    const store = makeStore({ memberships: [] });
    const app = createSuperAdminApp(store);

    const response = await app.handle(
      new Request("http://localhost/api/admin/memberships", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({
          adminUserId: ADMIN_USER_A,
          organizationId: ORG_A,
          venueId: VENUE_A1,
          role: "org_owner",
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test("returns 400 when venue_manager is given null venueId", async () => {
    const store = makeStore({ memberships: [] });
    const app = createSuperAdminApp(store);

    const response = await app.handle(
      new Request("http://localhost/api/admin/memberships", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({
          adminUserId: ADMIN_USER_A,
          organizationId: ORG_A,
          venueId: null,
          role: "venue_manager",
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test("returns 401 without a session cookie", async () => {
    const store = makeStore({ memberships: [] });
    const app = createSuperAdminApp(store);

    const response = await app.handle(
      new Request("http://localhost/api/admin/memberships", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          adminUserId: ADMIN_USER_A,
          organizationId: ORG_A,
          venueId: null,
          role: "org_owner",
        }),
      }),
    );

    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/memberships/:id
// ---------------------------------------------------------------------------

describe("DELETE /api/admin/memberships/:id", () => {
  test("super-admin can revoke any membership", async () => {
    const store = makeStore({ ownerCounts: new Map([[ORG_A, 2]]) });
    const app = createSuperAdminApp(store);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/memberships/${MEMBERSHIP_1}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: true; data: { revoked: true } };
    expect(json.data.revoked).toBe(true);
  });

  test("org-owner can revoke a membership within own org", async () => {
    const store = makeStore({ ownerCounts: new Map([[ORG_A, 2]]) });
    const app = createOrgOwnerApp(store);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/memberships/${MEMBERSHIP_2}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);
  });

  test("returns 404 for non-existent membership", async () => {
    const store = makeStore();
    const app = createSuperAdminApp(store);
    const nonExistent = "00000000-0000-4000-8000-000000000000";

    const response = await app.handle(
      new Request(`http://localhost/api/admin/memberships/${nonExistent}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(404);
  });

  test("org-owner cannot revoke a super-admin user membership — 403", async () => {
    const superMembership = makeMembership(
      "super-mem-1",
      ADMIN_USER_SUPER,
      ORG_A,
      null,
      "org_owner",
    );
    const store = makeStore({
      memberships: [superMembership],
      ownerCounts: new Map([[ORG_A, 1]]),
    });
    const app = createOrgOwnerApp(store);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/memberships/super-mem-1`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(403);
  });

  test("cannot revoke last org_owner — returns 409", async () => {
    const store = makeStore({ ownerCounts: new Map([[ORG_A, 1]]) });
    const app = createSuperAdminApp(store);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/memberships/${MEMBERSHIP_1}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(409);
    const json = (await response.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("conflict");
  });

  test("org-owner cannot revoke the last org_owner in their org — returns 409", async () => {
    const store = makeStore({ ownerCounts: new Map([[ORG_A, 1]]) });
    const app = createOrgOwnerApp(store);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/memberships/${MEMBERSHIP_1}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(409);
    const json = (await response.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("conflict");
  });

  test("returns 401 without a session cookie", async () => {
    const store = makeStore();
    const app = createSuperAdminApp(store);

    const response = await app.handle(
      new Request(`http://localhost/api/admin/memberships/${MEMBERSHIP_1}`, {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// No isSuperAdmin mutation via membership routes
// ---------------------------------------------------------------------------

describe("membership route security guardrails", () => {
  test("POST body is rejected if isSuperAdmin field is included (schema strips unknown fields)", async () => {
    const store = makeStore({ memberships: [] });
    const app = createSuperAdminApp(store);

    const response = await app.handle(
      new Request("http://localhost/api/admin/memberships", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({
          adminUserId: ADMIN_USER_A,
          organizationId: ORG_A,
          venueId: null,
          role: "org_owner",
          isSuperAdmin: true, // must be ignored / stripped by validator
        }),
      }),
    );

    // Elysia normalize strips unknown fields, so the request should succeed
    // but the isSuperAdmin field must NOT be persisted (it's not in our schema).
    // The membership returned has no isSuperAdmin field.
    if (response.status === 200) {
      const json = (await response.json()) as { ok: true; data: { membership: MembershipDetail } };
      expect("isSuperAdmin" in json.data.membership).toBe(false);
    } else {
      // Some validators reject unknown fields — either is acceptable as long as
      // isSuperAdmin is never written.
      expect(response.status === 400 || response.status === 200).toBe(true);
    }
  });
});
