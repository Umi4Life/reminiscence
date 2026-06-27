import { describe, expect, test } from "bun:test";

import type {
  AdminAuditEventInput,
  AdminAuditEventRecord,
  AdminAuditLogService,
  AuditEventFilters,
  ListAuditEventsResult,
} from "../src/admin/admin-audit-log";
import type { AdminManagementService } from "../src/admin/admin-management";
import type {
  MembershipManagementService,
  MembershipDetail,
} from "../src/admin/membership-management";
import type { OrgManagementService } from "../src/admin/org-management";
import type { OrganizationSummary } from "../src/admin/board-management";
import type { AdminRbacContext } from "../src/auth/rbac";
import { canManagePlatform, getOwnedOrganizationIds } from "../src/auth/rbac";
import { createTestApp } from "../src/app";
import {
  createFakeAuthService,
  createFakeOrgManagementService,
  orgOwnerMembership,
  sessionCookie,
  ORG_A,
  ORG_B,
} from "./admin-fixtures";
import { testAppConfig } from "./test-config";

// ---------------------------------------------------------------------------
// Capturing audit service (write-focused, list is a no-op)
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
      async listAuditEvents(): Promise<ListAuditEventsResult> {
        return { status: "ok", events: [] };
      },
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory audit service (supports both record and list with RBAC scoping)
// ---------------------------------------------------------------------------

function createInMemoryAuditService(initial: AdminAuditEventRecord[] = []): AdminAuditLogService {
  const stored: AdminAuditEventRecord[] = initial.map((e) => ({ ...e }));
  let counter = 0;

  return {
    async record(event) {
      stored.push({
        id: `evt-${++counter}`,
        actorAdminUserId: event.actorAdminUserId,
        action: event.action,
        targetId: event.targetId,
        organizationId: event.organizationId ?? null,
        metadata: event.metadata ?? null,
        createdAt: new Date(),
      });
    },

    async listAuditEvents(
      rbac: AdminRbacContext,
      filters: AuditEventFilters,
    ): Promise<ListAuditEventsResult> {
      const isSuperAdmin = canManagePlatform(rbac);
      const ownedOrgIds = isSuperAdmin ? null : getOwnedOrganizationIds(rbac);

      if (!isSuperAdmin && ownedOrgIds!.length === 0) {
        return { status: "forbidden" };
      }

      let results = stored.slice();

      if (filters.action !== undefined) {
        results = results.filter((e) => e.action === filters.action);
      }

      if (filters.organizationId !== undefined) {
        if (ownedOrgIds !== null && !ownedOrgIds.includes(filters.organizationId)) {
          return { status: "forbidden" };
        }
        results = results.filter((e) => e.organizationId === filters.organizationId);
      } else if (ownedOrgIds !== null) {
        results = results.filter(
          (e) => e.organizationId !== null && ownedOrgIds.includes(e.organizationId),
        );
      }

      if (filters.before !== undefined) {
        results = results.filter((e) => e.createdAt < filters.before!);
      }

      results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return { status: "ok", events: results.slice(0, filters.limit) };
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
    async listAdmins(_rbac) {
      void _rbac;
      return { status: "ok", page: { items: [], nextCursor: null } };
    },
    async getAdmin(adminUserId) {
      return {
        id: adminUserId,
        email: "target@example.com",
        displayName: "Target Admin",
        status: "active",
        isSuperAdmin: false,
        memberships: [],
        createdAt: ts,
        updatedAt: ts,
      };
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
    async updateAdmin(_rbac, adminUserId, patch) {
      void _rbac;
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

  test("no audit event when membership revocation is forbidden", async () => {
    const { events, service } = createCapturingAuditService();

    function createForbiddingMembershipManagement(): MembershipManagementService {
      return {
        async assignMembership() {
          return { status: "forbidden" };
        },
        async revokeMembership() {
          return { status: "forbidden" };
        },
      };
    }

    const app = createTestApp({
      config: testAppConfig,
      adminAuthService: createFakeAuthService([], { isSuperAdmin: true }),
      membershipManagementService: createForbiddingMembershipManagement(),
      auditLogService: service,
      checkDatabase: async () => true,
    });

    await app.handle(
      new Request(`http://localhost/api/admin/memberships/${MEMBERSHIP_ID}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(events.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// No audit event on guarded admin-user rejections
// ---------------------------------------------------------------------------

describe("audit log — no event on guarded admin rejections", () => {
  test("no audit event when admin update is forbidden (super-admin target protection)", async () => {
    const { events, service } = createCapturingAuditService();

    function createForbiddingAdminManagement(): AdminManagementService {
      return {
        async listAdmins() {
          return { status: "ok", page: { items: [], nextCursor: null } };
        },
        async getAdmin(id) {
          return {
            id,
            email: "target@example.com",
            displayName: "Target",
            status: "active",
            isSuperAdmin: true,
            memberships: [],
            createdAt: ts,
            updatedAt: ts,
          };
        },
        async createAdmin(input) {
          return {
            status: "created",
            admin: {
              id: "new-id",
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
        async updateAdmin() {
          return { status: "forbidden" };
        },
        async resetPassword() {
          return { status: "forbidden" };
        },
      };
    }

    const app = createTestApp({
      config: testAppConfig,
      adminAuthService: createFakeAuthService([], { isSuperAdmin: true }),
      adminManagementService: createForbiddingAdminManagement(),
      auditLogService: service,
      checkDatabase: async () => true,
    });

    await app.handle(
      new Request(`http://localhost/api/admin/admins/${ADMIN_TARGET_ID}`, {
        method: "PATCH",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ status: "disabled" }),
      }),
    );

    expect(events.length).toBe(0);
  });

  test("no audit event when last-super-admin disable is blocked (400)", async () => {
    const { events, service } = createCapturingAuditService();

    function createLastSuperAdminManagement(): AdminManagementService {
      return {
        async listAdmins() {
          return { status: "ok", page: { items: [], nextCursor: null } };
        },
        async getAdmin(id) {
          return {
            id,
            email: "super@example.com",
            displayName: "Super",
            status: "active",
            isSuperAdmin: true,
            memberships: [],
            createdAt: ts,
            updatedAt: ts,
          };
        },
        async createAdmin(input) {
          return {
            status: "created",
            admin: {
              id: "new-id",
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
        async updateAdmin() {
          return { status: "last_super_admin" };
        },
        async resetPassword() {
          return { status: "not_found" };
        },
      };
    }

    const app = createTestApp({
      config: testAppConfig,
      adminAuthService: createFakeAuthService([], { isSuperAdmin: true }),
      adminManagementService: createLastSuperAdminManagement(),
      auditLogService: service,
      checkDatabase: async () => true,
    });

    await app.handle(
      new Request(`http://localhost/api/admin/admins/${ADMIN_TARGET_ID}`, {
        method: "PATCH",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ status: "disabled" }),
      }),
    );

    expect(events.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Audit log readback — GET /api/admin/audit-events
// ---------------------------------------------------------------------------

const SEED_EVENTS: AdminAuditEventRecord[] = [
  {
    id: "evt-org-a-1",
    actorAdminUserId: ACTOR_ID,
    action: "org_update",
    targetId: ORG_A,
    organizationId: ORG_A,
    metadata: null,
    createdAt: new Date("2026-06-10T10:00:00.000Z"),
  },
  {
    id: "evt-org-b-1",
    actorAdminUserId: ACTOR_ID,
    action: "org_update",
    targetId: ORG_B,
    organizationId: ORG_B,
    metadata: null,
    createdAt: new Date("2026-06-10T09:00:00.000Z"),
  },
  {
    id: "evt-platform-1",
    actorAdminUserId: ACTOR_ID,
    action: "admin_create",
    targetId: "00000000-0000-4000-8000-000000000b01",
    organizationId: null,
    metadata: null,
    createdAt: new Date("2026-06-10T08:00:00.000Z"),
  },
  {
    id: "evt-sensitive-1",
    actorAdminUserId: ACTOR_ID,
    action: "admin_password_reset",
    targetId: "00000000-0000-4000-8000-000000000b02",
    organizationId: null,
    metadata: { password: "should-be-stripped", reason: "user request" } as Record<string, unknown>,
    createdAt: new Date("2026-06-10T07:00:00.000Z"),
  },
];

describe("audit log — readback route", () => {
  test("super-admin can list recent audit events", async () => {
    const service = createInMemoryAuditService(SEED_EVENTS);
    const app = createSuperAdminApp(service);

    const res = await app.handle(
      new Request("http://localhost/api/admin/audit-events", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { events: unknown[] } };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data.events)).toBe(true);
    expect((body.data.events as unknown[]).length).toBe(SEED_EVENTS.length);
  });

  test("non-super-admin without org-owner membership is forbidden", async () => {
    const service = createInMemoryAuditService(SEED_EVENTS);
    const app = createTestApp({
      config: testAppConfig,
      adminAuthService: createFakeAuthService([], { isSuperAdmin: false }),
      auditLogService: service,
      checkDatabase: async () => true,
    });

    const res = await app.handle(
      new Request("http://localhost/api/admin/audit-events", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(res.status).toBe(403);
  });

  test("venue-only admin without org-owner role is forbidden", async () => {
    const service = createInMemoryAuditService(SEED_EVENTS);
    const app = createTestApp({
      config: testAppConfig,
      adminAuthService: createFakeAuthService(
        [
          {
            organizationId: ORG_A,
            venueId: "00000000-0000-4000-8000-000000000011",
            role: "venue_staff",
          },
        ],
        { isSuperAdmin: false },
      ),
      auditLogService: service,
      checkDatabase: async () => true,
    });

    const res = await app.handle(
      new Request("http://localhost/api/admin/audit-events", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(res.status).toBe(403);
  });

  test("org-owner sees only events scoped to their organization", async () => {
    const service = createInMemoryAuditService(SEED_EVENTS);
    const app = createTestApp({
      config: testAppConfig,
      adminAuthService: createFakeAuthService([orgOwnerMembership], { isSuperAdmin: false }),
      auditLogService: service,
      checkDatabase: async () => true,
    });

    const res = await app.handle(
      new Request("http://localhost/api/admin/audit-events", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { events: Array<{ organizationId: string }> };
    };
    expect(body.ok).toBe(true);
    const events = body.data.events;
    expect(events.length > 0).toBe(true);
    for (const event of events) {
      expect(event.organizationId).toBe(ORG_A);
    }
  });

  test("org-owner cannot query events for a foreign organization", async () => {
    const service = createInMemoryAuditService(SEED_EVENTS);
    const app = createTestApp({
      config: testAppConfig,
      adminAuthService: createFakeAuthService([orgOwnerMembership], { isSuperAdmin: false }),
      auditLogService: service,
      checkDatabase: async () => true,
    });

    const res = await app.handle(
      new Request(`http://localhost/api/admin/audit-events?organizationId=${ORG_B}`, {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(res.status).toBe(403);
  });

  test("limit=0 is rejected with 400", async () => {
    const service = createInMemoryAuditService(SEED_EVENTS);
    const app = createSuperAdminApp(service);

    const res = await app.handle(
      new Request("http://localhost/api/admin/audit-events?limit=0", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(res.status).toBe(400);
  });

  test("limit exceeding 100 is rejected with 400", async () => {
    const service = createInMemoryAuditService(SEED_EVENTS);
    const app = createSuperAdminApp(service);

    const res = await app.handle(
      new Request("http://localhost/api/admin/audit-events?limit=101", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(res.status).toBe(400);
  });

  test("password material in metadata is not exposed", async () => {
    const service = createInMemoryAuditService(SEED_EVENTS);
    const app = createSuperAdminApp(service);

    const res = await app.handle(
      new Request("http://localhost/api/admin/audit-events", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { events: Array<{ action: string; metadata: Record<string, unknown> | null }> };
    };
    const sensitiveEvent = body.data.events.find((e) => e.action === "admin_password_reset");
    expect(sensitiveEvent !== undefined).toBe(true);
    const meta = sensitiveEvent?.metadata as Record<string, unknown> | null | undefined;
    expect(meta !== null && meta !== undefined).toBe(true);
    expect("password" in (meta ?? {})).toBe(false);
    expect(meta?.reason).toBe("user request");
  });

  test("unauthenticated request is rejected with 401", async () => {
    const service = createInMemoryAuditService(SEED_EVENTS);
    const app = createSuperAdminApp(service);

    const res = await app.handle(new Request("http://localhost/api/admin/audit-events"));

    expect(res.status).toBe(401);
  });
});
