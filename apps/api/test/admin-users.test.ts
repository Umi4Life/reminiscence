import { describe, expect, test } from "bun:test";

import { createTestApp } from "../src/app";
import { createFakeAuthService, orgOwnerMembership, ORG_A, sessionCookie } from "./admin-fixtures";
import { testAppConfig } from "./test-config";
import type { AdminManagementService } from "../src/admin/admin-management";
import type { AdminUserSummary } from "../src/admin/admin-management";
import type { CreateAdminInput } from "../src/admin/admin-management";
import type { PatchAdminInput } from "../src/admin/admin-management";
import type { AdminRbacContext } from "../src/auth/rbac";

const ADMIN_1 = "00000000-0000-4000-8000-000000000A01";
const ADMIN_2 = "00000000-0000-4000-8000-000000000A02";
const ADMIN_SUPER = "00000000-0000-4000-8000-000000000A03";
const ADMIN_SUPER_2 = "00000000-0000-4000-8000-000000000A04";
const ADMIN_OTHER_ORG = "00000000-0000-4000-8000-000000000A05";

const timestamp = new Date("2026-06-01T00:00:00.000Z");

function adminSummary(
  id: string,
  email: string,
  displayName: string,
  options: {
    status?: "active" | "disabled";
    isSuperAdmin?: boolean;
    memberships?: AdminUserSummary["memberships"];
  } = {},
): AdminUserSummary {
  return {
    id,
    email,
    displayName,
    status: options.status ?? "active",
    isSuperAdmin: options.isSuperAdmin ?? false,
    memberships: options.memberships ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

// Admins that have memberships in ORG_A (used for org_owner-scoped tests).
// ADMIN_SUPER here has NO ORG_A membership — org_owner will get 404 for them.
const adminsWithOrgA: AdminUserSummary[] = [
  adminSummary(ADMIN_1, "alice@example.com", "Alice", {
    memberships: [{ id: "mem-1", organizationId: ORG_A, venueId: null, role: "org_owner" }],
  }),
  adminSummary(ADMIN_2, "bob@example.com", "Bob", {
    memberships: [{ id: "mem-2", organizationId: ORG_A, venueId: null, role: "venue_manager" }],
  }),
  adminSummary(ADMIN_SUPER, "super@example.com", "Super Admin", { isSuperAdmin: true }),
  adminSummary(ADMIN_OTHER_ORG, "other@example.com", "Other Org Admin", {
    memberships: [
      {
        id: "mem-3",
        organizationId: "00000000-0000-4000-8000-000000000002",
        venueId: null,
        role: "org_owner",
      },
    ],
  }),
];

// Variant where the super-admin also has a membership in ORG_A, so the org_owner
// can see them but should still be blocked from managing them (403).
const adminsWithSuperAdminInOrgA: AdminUserSummary[] = [
  adminSummary(ADMIN_1, "alice@example.com", "Alice", {
    memberships: [{ id: "mem-1", organizationId: ORG_A, venueId: null, role: "org_owner" }],
  }),
  adminSummary(ADMIN_SUPER, "super@example.com", "Super Admin", {
    isSuperAdmin: true,
    memberships: [{ id: "mem-super", organizationId: ORG_A, venueId: null, role: "org_owner" }],
  }),
];

const adminsFixture: AdminUserSummary[] = [
  adminSummary(ADMIN_1, "alice@example.com", "Alice"),
  adminSummary(ADMIN_2, "bob@example.com", "Bob"),
  adminSummary(ADMIN_SUPER, "super@example.com", "Super Admin", { isSuperAdmin: true }),
];

function createFakeAdminManagementService(
  initialAdmins: AdminUserSummary[] = adminsFixture.map((a) => ({ ...a })),
): AdminManagementService & { revokedAdminIds: Set<string> } {
  const store: AdminUserSummary[] = initialAdmins.map((a) => ({ ...a }));
  const revokedAdminIds = new Set<string>();

  return {
    revokedAdminIds,

    async listAdmins(rbac: AdminRbacContext) {
      if (rbac.isSuperAdmin) {
        return { status: "ok", admins: store.slice() };
      }
      // Org-owner: return only admins with memberships in their org
      const ownedOrgIds = new Set(
        rbac.memberships
          .filter((m) => m.role === "org_owner" && m.venueId === null)
          .map((m) => m.organizationId),
      );
      if (ownedOrgIds.size === 0) return { status: "forbidden" };
      const admins = store.filter((a) =>
        a.memberships.some((m) => ownedOrgIds.has(m.organizationId)),
      );
      return { status: "ok", admins };
    },

    async getAdmin(adminUserId: string) {
      return store.find((a) => a.id === adminUserId) ?? null;
    },

    async createAdmin(input: CreateAdminInput) {
      if (store.some((a) => a.email === input.email)) {
        return { status: "conflict" };
      }
      const created: AdminUserSummary = {
        id: crypto.randomUUID(),
        email: input.email,
        displayName: input.displayName,
        status: input.status,
        isSuperAdmin: false,
        memberships: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.push(created);
      return { status: "created", admin: created };
    },

    async updateAdmin(rbac: AdminRbacContext, adminUserId: string, patch: PatchAdminInput) {
      const index = store.findIndex((a) => a.id === adminUserId);
      if (index === -1) return { status: "not_found" };

      const admin = store[index] as AdminUserSummary;

      if (!rbac.isSuperAdmin) {
        const ownedOrgIds = new Set(
          rbac.memberships
            .filter((m) => m.role === "org_owner" && m.venueId === null)
            .map((m) => m.organizationId),
        );
        if (ownedOrgIds.size === 0) return { status: "not_found" };
        const inOrg = admin.memberships.some((m) => ownedOrgIds.has(m.organizationId));
        if (!inOrg) return { status: "not_found" };
        if (admin.isSuperAdmin) return { status: "forbidden" };
      } else {
        if (patch.status === "disabled" && admin.isSuperAdmin) {
          const activeSuperAdmins = store.filter((a) => a.isSuperAdmin && a.status === "active");
          if (activeSuperAdmins.length <= 1) {
            return { status: "last_super_admin" };
          }
          return { status: "forbidden" };
        }
      }

      const updated = { ...admin, ...patch, updatedAt: new Date() };
      store[index] = updated;

      if (patch.status === "disabled") {
        revokedAdminIds.add(adminUserId);
      }

      return { status: "updated", admin: updated };
    },

    async resetPassword(rbac: AdminRbacContext, adminUserId: string) {
      const found = store.find((a) => a.id === adminUserId);
      if (!found) return { status: "not_found" };

      if (!rbac.isSuperAdmin) {
        const ownedOrgIds = new Set(
          rbac.memberships
            .filter((m) => m.role === "org_owner" && m.venueId === null)
            .map((m) => m.organizationId),
        );
        if (ownedOrgIds.size === 0) return { status: "not_found" };
        const inOrg = found.memberships.some((m) => ownedOrgIds.has(m.organizationId));
        if (!inOrg) return { status: "not_found" };
        if (found.isSuperAdmin) return { status: "forbidden" };
      }

      revokedAdminIds.add(adminUserId);
      return { status: "reset" };
    },
  };
}

function createSuperAdminApp(adminManagementService: AdminManagementService) {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService([], { isSuperAdmin: true }),
    adminManagementService,
    checkDatabase: async () => true,
  });
}

function createRegularAdminApp(adminManagementService: AdminManagementService) {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService([]),
    adminManagementService,
    checkDatabase: async () => true,
  });
}

function createOrgOwnerApp(adminManagementService: AdminManagementService) {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService([orgOwnerMembership]),
    adminManagementService,
    checkDatabase: async () => true,
  });
}

describe("admin users routes", () => {
  describe("GET /api/admin/admins", () => {
    test("super-admin can list all admin users", async () => {
      const service = createFakeAdminManagementService();
      const app = createSuperAdminApp(service);

      const response = await app.handle(
        new Request("http://localhost/api/admin/admins", {
          headers: { cookie: sessionCookie },
        }),
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        ok: true;
        data: { admins: Array<{ id: string }> };
      };
      expect(json.data.admins.length).toBe(3);
    });

    test("org-owner can list admins within their org", async () => {
      const service = createFakeAdminManagementService(adminsWithOrgA.map((a) => ({ ...a })));
      const app = createOrgOwnerApp(service);

      const response = await app.handle(
        new Request("http://localhost/api/admin/admins", {
          headers: { cookie: sessionCookie },
        }),
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        ok: true;
        data: { admins: Array<{ id: string }> };
      };
      // Only ADMIN_1 and ADMIN_2 are in ORG_A; ADMIN_SUPER has no org membership;
      // ADMIN_OTHER_ORG belongs to a different org
      const ids = json.data.admins.map((a) => a.id);
      expect(ids.includes(ADMIN_1)).toBe(true);
      expect(ids.includes(ADMIN_2)).toBe(true);
      expect(ids.includes(ADMIN_SUPER)).toBe(false);
      expect(ids.includes(ADMIN_OTHER_ORG)).toBe(false);
    });

    test("non-org-owner (no memberships) gets 403", async () => {
      const service = createFakeAdminManagementService();
      const app = createRegularAdminApp(service);

      const response = await app.handle(
        new Request("http://localhost/api/admin/admins", {
          headers: { cookie: sessionCookie },
        }),
      );

      expect(response.status).toBe(403);
    });

    test("returns 401 without session cookie", async () => {
      const service = createFakeAdminManagementService();
      const app = createSuperAdminApp(service);

      const response = await app.handle(new Request("http://localhost/api/admin/admins"));
      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/admin/admins", () => {
    test("super-admin can create an admin user", async () => {
      const service = createFakeAdminManagementService();
      const app = createSuperAdminApp(service);

      const response = await app.handle(
        new Request("http://localhost/api/admin/admins", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({
            email: "newadmin@example.com",
            displayName: "New Admin",
            password: "password123",
          }),
        }),
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        ok: true;
        data: { admin: { email: string; isSuperAdmin: boolean } };
      };
      expect(json.data.admin.email).toBe("newadmin@example.com");
      expect(json.data.admin.isSuperAdmin).toBe(false);
    });

    test("email is normalized to lowercase", async () => {
      const service = createFakeAdminManagementService();
      const app = createSuperAdminApp(service);

      const response = await app.handle(
        new Request("http://localhost/api/admin/admins", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({
            email: "  Admin@Example.COM  ",
            displayName: "New Admin",
            password: "password123",
          }),
        }),
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as { ok: true; data: { admin: { email: string } } };
      expect(json.data.admin.email).toBe("admin@example.com");
    });

    test("duplicate email returns 400", async () => {
      const service = createFakeAdminManagementService();
      const app = createSuperAdminApp(service);

      const response = await app.handle(
        new Request("http://localhost/api/admin/admins", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({
            email: "alice@example.com",
            displayName: "Alice 2",
            password: "password123",
          }),
        }),
      );

      expect(response.status).toBe(400);
      const json = (await response.json()) as { ok: false; error: { code: string } };
      expect(json.error.code).toBe("validation_error");
    });

    test("org-owner cannot create admin user — gets 403", async () => {
      const service = createFakeAdminManagementService();
      const app = createOrgOwnerApp(service);

      const response = await app.handle(
        new Request("http://localhost/api/admin/admins", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({
            email: "newadmin@example.com",
            displayName: "New Admin",
            password: "password123",
          }),
        }),
      );

      expect(response.status).toBe(403);
    });

    test("non-super-admin cannot create admin user — gets 403", async () => {
      const service = createFakeAdminManagementService();
      const app = createRegularAdminApp(service);

      const response = await app.handle(
        new Request("http://localhost/api/admin/admins", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({
            email: "newadmin@example.com",
            displayName: "New Admin",
            password: "password123",
          }),
        }),
      );

      expect(response.status).toBe(403);
    });

    test("isSuperAdmin field in body is silently ignored — created admin is not super-admin", async () => {
      const service = createFakeAdminManagementService();
      const app = createSuperAdminApp(service);

      const response = await app.handle(
        new Request("http://localhost/api/admin/admins", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({
            email: "newadmin2@example.com",
            displayName: "New Admin 2",
            password: "password123",
            isSuperAdmin: true,
          }),
        }),
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        ok: true;
        data: { admin: { isSuperAdmin: boolean } };
      };
      expect(json.data.admin.isSuperAdmin).toBe(false);
    });

    test("password too short returns 400", async () => {
      const service = createFakeAdminManagementService();
      const app = createSuperAdminApp(service);

      const response = await app.handle(
        new Request("http://localhost/api/admin/admins", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({
            email: "newadmin@example.com",
            displayName: "New Admin",
            password: "short",
          }),
        }),
      );

      expect(response.status).toBe(400);
    });
  });

  describe("PATCH /api/admin/admins/:adminUserId", () => {
    test("super-admin can update display name", async () => {
      const service = createFakeAdminManagementService();
      const app = createSuperAdminApp(service);

      const response = await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_1}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ displayName: "Alice Updated" }),
        }),
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        ok: true;
        data: { admin: { displayName: string } };
      };
      expect(json.data.admin.displayName).toBe("Alice Updated");
    });

    test("super-admin can disable a non-super-admin", async () => {
      const service = createFakeAdminManagementService();
      const app = createSuperAdminApp(service);

      const response = await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_1}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ status: "disabled" }),
        }),
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as { ok: true; data: { admin: { status: string } } };
      expect(json.data.admin.status).toBe("disabled");
    });

    test("disabling a user revokes their sessions", async () => {
      const service = createFakeAdminManagementService();
      const app = createSuperAdminApp(service);

      await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_1}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ status: "disabled" }),
        }),
      );

      expect(service.revokedAdminIds.has(ADMIN_1)).toBe(true);
    });

    test("cannot disable a super-admin — gets 403", async () => {
      // Use a fixture with two super-admins so we don't hit the last-super-admin guard
      const service = createFakeAdminManagementService([
        adminSummary(ADMIN_1, "alice@example.com", "Alice"),
        adminSummary(ADMIN_SUPER, "super@example.com", "Super Admin", { isSuperAdmin: true }),
        adminSummary(ADMIN_SUPER_2, "super2@example.com", "Super Admin 2", { isSuperAdmin: true }),
      ]);
      const app = createSuperAdminApp(service);

      const response = await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_SUPER}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ status: "disabled" }),
        }),
      );

      expect(response.status).toBe(403);
    });

    test("returns 400 when disabling the last active super-admin", async () => {
      const service = createFakeAdminManagementService([
        adminSummary(ADMIN_SUPER, "super@example.com", "Super Admin", { isSuperAdmin: true }),
      ]);
      const app = createSuperAdminApp(service);

      const response = await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_SUPER}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ status: "disabled" }),
        }),
      );

      expect(response.status).toBe(400);
      const json = (await response.json()) as { ok: false; error: { code: string } };
      expect(json.error.code).toBe("validation_error");
    });

    test("returns 404 for unknown admin id", async () => {
      const service = createFakeAdminManagementService();
      const app = createSuperAdminApp(service);

      const response = await app.handle(
        new Request(`http://localhost/api/admin/admins/00000000-0000-4000-8000-000000000999`, {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ displayName: "Nobody" }),
        }),
      );

      expect(response.status).toBe(404);
    });

    test("org-owner can update display name of a user in their org", async () => {
      const service = createFakeAdminManagementService(adminsWithOrgA.map((a) => ({ ...a })));
      const app = createOrgOwnerApp(service);

      const response = await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_2}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ displayName: "Bob Updated" }),
        }),
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        ok: true;
        data: { admin: { displayName: string } };
      };
      expect(json.data.admin.displayName).toBe("Bob Updated");
    });

    test("org-owner cannot update a super-admin in their org — gets 403", async () => {
      const service = createFakeAdminManagementService(
        adminsWithSuperAdminInOrgA.map((a) => ({ ...a })),
      );
      const app = createOrgOwnerApp(service);

      const response = await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_SUPER}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ displayName: "Hacked" }),
        }),
      );

      expect(response.status).toBe(403);
    });

    test("org-owner cannot update admin outside their org — gets 404", async () => {
      const service = createFakeAdminManagementService(adminsWithOrgA.map((a) => ({ ...a })));
      const app = createOrgOwnerApp(service);

      const response = await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_OTHER_ORG}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ displayName: "Cross-org attack" }),
        }),
      );

      expect(response.status).toBe(404);
    });

    test("non-org-owner (no memberships) cannot patch admin user — gets 404", async () => {
      const service = createFakeAdminManagementService(adminsWithOrgA.map((a) => ({ ...a })));
      const app = createRegularAdminApp(service);

      const response = await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_1}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ displayName: "New Name" }),
        }),
      );

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/admin/admins/:adminUserId/password-reset", () => {
    test("super-admin can reset an admin password", async () => {
      const service = createFakeAdminManagementService();
      const app = createSuperAdminApp(service);

      const response = await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_1}/password-reset`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ password: "newpassword123" }),
        }),
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as { ok: true; data: { reset: true } };
      expect(json.data.reset).toBe(true);
    });

    test("password reset revokes all sessions", async () => {
      const service = createFakeAdminManagementService();
      const app = createSuperAdminApp(service);

      await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_1}/password-reset`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ password: "newpassword123" }),
        }),
      );

      expect(service.revokedAdminIds.has(ADMIN_1)).toBe(true);
    });

    test("returns 404 for unknown admin id", async () => {
      const service = createFakeAdminManagementService();
      const app = createSuperAdminApp(service);

      const response = await app.handle(
        new Request(
          `http://localhost/api/admin/admins/00000000-0000-4000-8000-000000000999/password-reset`,
          {
            method: "POST",
            headers: { "content-type": "application/json", cookie: sessionCookie },
            body: JSON.stringify({ password: "newpassword123" }),
          },
        ),
      );

      expect(response.status).toBe(404);
    });

    test("org-owner can reset password for a user in their org", async () => {
      const service = createFakeAdminManagementService(adminsWithOrgA.map((a) => ({ ...a })));
      const app = createOrgOwnerApp(service);

      const response = await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_2}/password-reset`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ password: "newpassword123" }),
        }),
      );

      expect(response.status).toBe(200);
      expect(service.revokedAdminIds.has(ADMIN_2)).toBe(true);
    });

    test("org-owner cannot reset a super-admin password (super-admin is in their org) — gets 403", async () => {
      const service = createFakeAdminManagementService(
        adminsWithSuperAdminInOrgA.map((a) => ({ ...a })),
      );
      const app = createOrgOwnerApp(service);

      const response = await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_SUPER}/password-reset`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ password: "newpassword123" }),
        }),
      );

      expect(response.status).toBe(403);
    });

    test("org-owner cannot reset password for admin outside their org — gets 404", async () => {
      const service = createFakeAdminManagementService(adminsWithOrgA.map((a) => ({ ...a })));
      const app = createOrgOwnerApp(service);

      const response = await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_OTHER_ORG}/password-reset`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ password: "newpassword123" }),
        }),
      );

      expect(response.status).toBe(404);
    });

    test("non-org-owner cannot reset password — gets 404", async () => {
      const service = createFakeAdminManagementService(adminsWithOrgA.map((a) => ({ ...a })));
      const app = createRegularAdminApp(service);

      const response = await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_1}/password-reset`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ password: "newpassword123" }),
        }),
      );

      expect(response.status).toBe(404);
    });

    test("short password returns 400", async () => {
      const service = createFakeAdminManagementService();
      const app = createSuperAdminApp(service);

      const response = await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_1}/password-reset`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ password: "short" }),
        }),
      );

      expect(response.status).toBe(400);
    });
  });
});
