import { describe, expect, test } from "bun:test";

import type { AdminAuditEventInput, AdminAuditLogService } from "../src/admin/admin-audit-log";
import type { AdminManagementService } from "../src/admin/admin-management";
import type {
  MembershipManagementService,
  MembershipDetail,
} from "../src/admin/membership-management";
import type { OrgManagementService } from "../src/admin/org-management";
import type { OrganizationSummary } from "../src/admin/board-management";
import { createTestApp } from "../src/app";
import {
  createFakeAuthService,
  createFakeOrgManagementService,
  sessionCookie,
  ORG_A,
} from "./admin-fixtures";
import { testAppConfig } from "./test-config";

// ---------------------------------------------------------------------------
// Capturing audit service
// ---------------------------------------------------------------------------

function createCapturingAuditService(): {
  events: AdminAuditEventInput[];
  service: AdminAuditLogService;
} {
  const events: AdminAuditEventInput[] = [];
  return {
    events,
    service: {
      async record(event) {
        events.push(event);
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures — minimal fake services for audit-focused tests
// ---------------------------------------------------------------------------

const ACTOR_ID = "admin-1"; // matches createFakeAuthService default

const EMPTY_ORG_ID = "00000000-0000-4000-8000-000000000099";
const MEMBERSHIP_ID = "00000000-0000-4000-8000-000000000901";
const ADMIN_TARGET_ID = "00000000-0000-4000-8000-000000000a01";
const ts = new Date("2026-06-01T00:00:00.000Z");

function createFakeEmptyOrgManagement(): OrgManagementService {
  const orgs: OrganizationSummary[] = [
    { id: EMPTY_ORG_ID, slug: "empty-org", name: "Empty Org", createdAt: ts, updatedAt: ts },
    { id: ORG_A, slug: "org-a", name: "Organization A", createdAt: ts, updatedAt: ts },
  ];

  return {
    async createOrganization(_rbac, input) {
      const created: OrganizationSummary = {
        id: "new-org-id",
        slug: input.slug,
        name: input.name,
        createdAt: ts,
        updatedAt: ts,
      };
      orgs.push(created);
      return { status: "created", organization: created };
    },
    async updateOrganization(_rbac, orgId, patch) {
      const org = orgs.find((o) => o.id === orgId);
      if (!org) return { status: "not_found" };
      const updated = { ...org, ...patch, updatedAt: ts };
      return { status: "updated", organization: updated };
    },
    async deleteOrganization(_rbac, orgId) {
      const index = orgs.findIndex((o) => o.id === orgId);
      if (index === -1) return { status: "not_found" };
      orgs.splice(index, 1);
      return { status: "deleted" };
    },
  };
}

function createFakeMembershipManagement(): MembershipManagementService {
  const memberships: MembershipDetail[] = [
    {
      id: MEMBERSHIP_ID,
      adminUserId: ADMIN_TARGET_ID,
      organizationId: ORG_A,
      venueId: null,
      role: "org_owner",
      createdAt: ts,
    },
  ];

  return {
    async assignMembership(_rbac, input) {
      const membership: MembershipDetail = {
        id: "new-membership-id",
        adminUserId: input.adminUserId,
        organizationId: input.organizationId,
        venueId: input.venueId,
        role: input.role,
        createdAt: ts,
      };
      memberships.push(membership);
      return { status: "assigned", membership };
    },
    async revokeMembership(_rbac, membershipId) {
      const index = memberships.findIndex((m) => m.id === membershipId);
      if (index === -1) return { status: "not_found" };
      memberships.splice(index, 1);
      return { status: "revoked" };
    },
  };
}

function createFakeAdminManagement(): AdminManagementService {
  return {
    async listAdmins() {
      return [];
    },
    async createAdmin(input) {
      return {
        status: "created",
        admin: {
          id: "new-admin-id",
          email: input.email,
          displayName: input.displayName,
          status: input.status,
          isSuperAdmin: false,
          memberships: [],
          createdAt: ts,
          updatedAt: ts,
        },
      };
    },
    async updateAdmin(adminUserId, patch) {
      return {
        status: "updated",
        admin: {
          id: adminUserId,
          email: "target@example.com",
          displayName: patch.displayName ?? "Target Admin",
          status: patch.status ?? "active",
          isSuperAdmin: false,
          memberships: [],
          createdAt: ts,
          updatedAt: ts,
        },
      };
    },
    async resetPassword() {
      return { status: "reset" };
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSuperAdminApp(auditLogService: AdminAuditLogService) {
  return createTestApp({
    config: testAppConfig,
    adminAuthService: createFakeAuthService([], { isSuperAdmin: true }),
    orgManagementService: createFakeEmptyOrgManagement(),
    membershipManagementService: createFakeMembershipManagement(),
    adminManagementService: createFakeAdminManagement(),
    auditLogService,
    checkDatabase: async () => true,
  });
}

// ---------------------------------------------------------------------------
// Organization audit events
// ---------------------------------------------------------------------------

describe("audit log — organization mutations", () => {
  test("org_create is recorded after successful create", async () => {
    const { events, service } = createCapturingAuditService();
    const app = createSuperAdminApp(service);

    await app.handle(
      new Request("http://localhost/api/admin/organizations", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ slug: "new-org", name: "New Org" }),
      }),
    );

    expect(events.length).toBe(1);
    expect(events[0]?.action).toBe("org_create");
    expect(events[0]?.actorAdminUserId).toBe(ACTOR_ID);
    expect(typeof events[0]?.targetId).toBe("string");
  });

  test("org_update is recorded after successful update", async () => {
    const { events, service } = createCapturingAuditService();
    const app = createSuperAdminApp(service);

    await app.handle(
      new Request(`http://localhost/api/admin/organizations/${ORG_A}`, {
        method: "PATCH",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated Name" }),
      }),
    );

    expect(events.length).toBe(1);
    expect(events[0]?.action).toBe("org_update");
    expect(events[0]?.actorAdminUserId).toBe(ACTOR_ID);
    expect(events[0]?.targetId).toBe(ORG_A);
    expect(events[0]?.organizationId).toBe(ORG_A);
  });

  test("org_delete is recorded after successful delete", async () => {
    const { events, service } = createCapturingAuditService();
    const app = createSuperAdminApp(service);

    await app.handle(
      new Request(`http://localhost/api/admin/organizations/${EMPTY_ORG_ID}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(events.length).toBe(1);
    expect(events[0]?.action).toBe("org_delete");
    expect(events[0]?.targetId).toBe(EMPTY_ORG_ID);
  });

  test("no audit event on failed org create (conflict)", async () => {
    const orgManagement = createFakeOrgManagementService();
    const { events, service } = createCapturingAuditService();
    const app = createTestApp({
      config: testAppConfig,
      adminAuthService: createFakeAuthService([], { isSuperAdmin: true }),
      orgManagementService: orgManagement,
      auditLogService: service,
      checkDatabase: async () => true,
    });

    // org-a already exists in the fixture
    await app.handle(
      new Request("http://localhost/api/admin/organizations", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ slug: "org-a", name: "Duplicate" }),
      }),
    );

    expect(events.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Admin user audit events
// ---------------------------------------------------------------------------

describe("audit log — admin user mutations", () => {
  test("admin_create is recorded after successful create", async () => {
    const { events, service } = createCapturingAuditService();
    const app = createSuperAdminApp(service);

    await app.handle(
      new Request("http://localhost/api/admin/admins", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({
          email: "newadmin@example.com",
          displayName: "New Admin",
          password: "password123",
        }),
      }),
    );

    expect(events.length).toBe(1);
    expect(events[0]?.action).toBe("admin_create");
    expect(events[0]?.actorAdminUserId).toBe(ACTOR_ID);
    expect(typeof events[0]?.targetId).toBe("string");
  });

  test("admin_update is recorded after successful update", async () => {
    const { events, service } = createCapturingAuditService();
    const app = createSuperAdminApp(service);

    await app.handle(
      new Request(`http://localhost/api/admin/admins/${ADMIN_TARGET_ID}`, {
        method: "PATCH",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Updated Name" }),
      }),
    );

    expect(events.length).toBe(1);
    expect(events[0]?.action).toBe("admin_update");
    expect(events[0]?.targetId).toBe(ADMIN_TARGET_ID);
  });

  test("admin_update records status in metadata when admin is disabled", async () => {
    const { events, service } = createCapturingAuditService();
    const app = createSuperAdminApp(service);

    await app.handle(
      new Request(`http://localhost/api/admin/admins/${ADMIN_TARGET_ID}`, {
        method: "PATCH",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ status: "disabled" }),
      }),
    );

    expect(events.length).toBe(1);
    expect(events[0]?.action).toBe("admin_update");
    expect((events[0]?.metadata as Record<string, unknown>)?.status).toBe("disabled");
  });

  test("admin_password_reset is recorded after successful reset", async () => {
    const { events, service } = createCapturingAuditService();
    const app = createSuperAdminApp(service);

    await app.handle(
      new Request(`http://localhost/api/admin/admins/${ADMIN_TARGET_ID}/password-reset`, {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ password: "newpassword123" }),
      }),
    );

    expect(events.length).toBe(1);
    expect(events[0]?.action).toBe("admin_password_reset");
    expect(events[0]?.targetId).toBe(ADMIN_TARGET_ID);
  });
});

// ---------------------------------------------------------------------------
// Membership audit events
// ---------------------------------------------------------------------------

describe("audit log — membership mutations", () => {
  test("membership_assign is recorded after successful assignment", async () => {
    const { events, service } = createCapturingAuditService();
    const app = createSuperAdminApp(service);

    await app.handle(
      new Request("http://localhost/api/admin/memberships", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({
          adminUserId: ADMIN_TARGET_ID,
          organizationId: ORG_A,
          venueId: null,
          role: "org_owner",
        }),
      }),
    );

    expect(events.length).toBe(1);
    expect(events[0]?.action).toBe("membership_assign");
    expect(events[0]?.actorAdminUserId).toBe(ACTOR_ID);
    expect(events[0]?.organizationId).toBe(ORG_A);
    const meta = events[0]?.metadata as Record<string, unknown>;
    expect(meta?.adminUserId).toBe(ADMIN_TARGET_ID);
    expect(meta?.role).toBe("org_owner");
  });

  test("membership_revoke is recorded after successful revocation", async () => {
    const { events, service } = createCapturingAuditService();
    const app = createSuperAdminApp(service);

    await app.handle(
      new Request(`http://localhost/api/admin/memberships/${MEMBERSHIP_ID}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(events.length).toBe(1);
    expect(events[0]?.action).toBe("membership_revoke");
    expect(events[0]?.targetId).toBe(MEMBERSHIP_ID);
    expect(events[0]?.actorAdminUserId).toBe(ACTOR_ID);
  });

  test("no audit event when membership not found", async () => {
    const { events, service } = createCapturingAuditService();
    const app = createSuperAdminApp(service);

    await app.handle(
      new Request(`http://localhost/api/admin/memberships/00000000-0000-4000-8000-000000000999`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(events.length).toBe(0);
  });
});
