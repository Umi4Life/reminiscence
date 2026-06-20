import { describe, expect, test } from "bun:test";

import { createTestApp } from "../src/app";
import { createFakeAuthService, sessionCookie } from "./admin-fixtures";
import { testAppConfig } from "./test-config";
import type { AdminManagementService } from "../src/admin/admin-management";
import type { AdminUserSummary } from "../src/admin/admin-management";
import type { CreateAdminInput } from "../src/admin/admin-management";
import type { PatchAdminInput } from "../src/admin/admin-management";

const ADMIN_1 = "00000000-0000-4000-8000-000000000A01";
const ADMIN_2 = "00000000-0000-4000-8000-000000000A02";
const ADMIN_SUPER = "00000000-0000-4000-8000-000000000A03";
const ADMIN_SUPER_2 = "00000000-0000-4000-8000-000000000A04";

const timestamp = new Date("2026-06-01T00:00:00.000Z");

function adminSummary(
  id: string,
  email: string,
  displayName: string,
  options: { status?: "active" | "disabled"; isSuperAdmin?: boolean } = {},
): AdminUserSummary {
  return {
    id,
    email,
    displayName,
    status: options.status ?? "active",
    isSuperAdmin: options.isSuperAdmin ?? false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

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

    async listAdmins() {
      return store.slice();
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
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.push(created);
      return { status: "created", admin: created };
    },

    async updateAdmin(adminUserId: string, patch: PatchAdminInput) {
      const index = store.findIndex((a) => a.id === adminUserId);
      if (index === -1) return { status: "not_found" };

      const admin = store[index] as AdminUserSummary;

      if (patch.status === "disabled" && admin.isSuperAdmin) {
        const activeSuperAdmins = store.filter((a) => a.isSuperAdmin && a.status === "active");
        if (activeSuperAdmins.length <= 1) {
          return { status: "last_super_admin" };
        }
        return { status: "forbidden" };
      }

      const updated = { ...admin, ...patch, updatedAt: new Date() };
      store[index] = updated;

      if (patch.status === "disabled") {
        revokedAdminIds.add(adminUserId);
      }

      return { status: "updated", admin: updated };
    },

    async resetPassword(adminUserId: string) {
      const found = store.find((a) => a.id === adminUserId);
      if (!found) return { status: "not_found" };
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

    test("non-super-admin gets 403", async () => {
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

    test("non-super-admin cannot patch admin user — gets 403", async () => {
      const service = createFakeAdminManagementService();
      const app = createRegularAdminApp(service);

      const response = await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_1}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ displayName: "New Name" }),
        }),
      );

      expect(response.status).toBe(403);
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

    test("non-super-admin cannot reset password — gets 403", async () => {
      const service = createFakeAdminManagementService();
      const app = createRegularAdminApp(service);

      const response = await app.handle(
        new Request(`http://localhost/api/admin/admins/${ADMIN_1}/password-reset`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: sessionCookie },
          body: JSON.stringify({ password: "newpassword123" }),
        }),
      );

      expect(response.status).toBe(403);
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
