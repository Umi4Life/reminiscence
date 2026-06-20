import type { AdminMembership, AdminUser, Database } from "@queue-reminiscence/db";
import { adminMemberships, adminSessions, adminUsers } from "@queue-reminiscence/db/schema";
import { and, count, eq, inArray, isNull } from "drizzle-orm";

import { hashPassword } from "../auth/passwords";
import { canManagePlatform, getOwnedOrganizationIds, type AdminRbacContext } from "../auth/rbac";

export interface AdminUserSummary {
  id: string;
  email: string;
  displayName: string;
  status: "active" | "disabled";
  isSuperAdmin: boolean;
  memberships: Array<{
    id: string;
    organizationId: string;
    venueId: string | null;
    role: "org_owner" | "venue_manager" | "venue_staff";
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAdminInput {
  email: string;
  displayName: string;
  password: string;
  status: "active";
}

export interface PatchAdminInput {
  displayName?: string;
  status?: "active" | "disabled";
}

export type CreateAdminResult =
  | { status: "created"; admin: AdminUserSummary }
  | { status: "conflict" };

export type ListAdminsResult =
  | { status: "ok"; admins: AdminUserSummary[] }
  | { status: "forbidden" };

export type UpdateAdminResult =
  | { status: "updated"; admin: AdminUserSummary }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "last_super_admin" };

export type ResetAdminPasswordResult =
  | { status: "reset" }
  | { status: "not_found" }
  | { status: "forbidden" };

export interface AdminManagementService {
  listAdmins(rbac: AdminRbacContext): Promise<ListAdminsResult>;
  getAdmin(adminUserId: string): Promise<AdminUserSummary | null>;
  createAdmin(input: CreateAdminInput): Promise<CreateAdminResult>;
  updateAdmin(
    rbac: AdminRbacContext,
    adminUserId: string,
    patch: PatchAdminInput,
  ): Promise<UpdateAdminResult>;
  resetPassword(
    rbac: AdminRbacContext,
    adminUserId: string,
    newPassword: string,
  ): Promise<ResetAdminPasswordResult>;
}

function toMembershipSummary(m: AdminMembership) {
  return {
    id: m.id,
    organizationId: m.organizationId,
    venueId: m.venueId,
    role: m.role,
  };
}

function toAdminUserSummary(
  admin: AdminUser,
  memberships: AdminMembership[] = [],
): AdminUserSummary {
  return {
    id: admin.id,
    email: admin.email,
    displayName: admin.displayName,
    status: admin.status,
    isSuperAdmin: admin.isSuperAdmin,
    memberships: memberships.map(toMembershipSummary),
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}

async function loadMembershipsForUser(
  db: Database,
  adminUserId: string,
): Promise<AdminMembership[]> {
  return db.select().from(adminMemberships).where(eq(adminMemberships.adminUserId, adminUserId));
}

async function revokeAdminSessions(db: Database, adminUserId: string): Promise<void> {
  await db
    .update(adminSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(adminSessions.adminUserId, adminUserId), isNull(adminSessions.revokedAt)));
}

export function createDbAdminManagementService(db: Database): AdminManagementService {
  return {
    async listAdmins(rbac): Promise<ListAdminsResult> {
      if (canManagePlatform(rbac)) {
        const rows = await db.select().from(adminUsers).orderBy(adminUsers.createdAt);
        const allMemberships = await db.select().from(adminMemberships);
        return {
          status: "ok",
          admins: rows.map((admin) =>
            toAdminUserSummary(
              admin,
              allMemberships.filter((m) => m.adminUserId === admin.id),
            ),
          ),
        };
      }

      // Org-owner: return only admins with memberships in their org(s)
      const ownedOrgIds = getOwnedOrganizationIds(rbac);
      if (ownedOrgIds.length === 0) return { status: "forbidden" };

      const orgMemberships = await db
        .select()
        .from(adminMemberships)
        .where(inArray(adminMemberships.organizationId, ownedOrgIds));

      if (orgMemberships.length === 0) return { status: "ok", admins: [] };

      const adminUserIds = [...new Set(orgMemberships.map((m) => m.adminUserId))];

      const rows = await db
        .select()
        .from(adminUsers)
        .where(inArray(adminUsers.id, adminUserIds))
        .orderBy(adminUsers.createdAt);

      return {
        status: "ok",
        admins: rows.map((admin) =>
          toAdminUserSummary(
            admin,
            orgMemberships.filter((m) => m.adminUserId === admin.id),
          ),
        ),
      };
    },

    async getAdmin(adminUserId: string): Promise<AdminUserSummary | null> {
      const [admin] = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.id, adminUserId))
        .limit(1);

      if (!admin) return null;

      const memberships = await loadMembershipsForUser(db, adminUserId);
      return toAdminUserSummary(admin, memberships);
    },

    async createAdmin(input: CreateAdminInput): Promise<CreateAdminResult> {
      const normalizedEmail = input.email.trim().toLowerCase();
      const [existing] = await db
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.email, normalizedEmail))
        .limit(1);

      if (existing) {
        return { status: "conflict" };
      }

      const passwordHash = await hashPassword(input.password);
      const [created] = await db
        .insert(adminUsers)
        .values({
          email: normalizedEmail,
          displayName: input.displayName.trim(),
          passwordHash,
          status: input.status,
          isSuperAdmin: false,
        })
        .returning();

      return { status: "created", admin: toAdminUserSummary(created, []) };
    },

    async updateAdmin(rbac, adminUserId, patch): Promise<UpdateAdminResult> {
      const [admin] = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.id, adminUserId))
        .limit(1);

      if (!admin) return { status: "not_found" };

      if (!canManagePlatform(rbac)) {
        // Org-owner path: target must be in one of their orgs and must not be a super-admin
        const ownedOrgIds = getOwnedOrganizationIds(rbac);
        if (ownedOrgIds.length === 0) return { status: "not_found" };

        const [inOrgMembership] = await db
          .select({ id: adminMemberships.id })
          .from(adminMemberships)
          .where(
            and(
              eq(adminMemberships.adminUserId, adminUserId),
              inArray(adminMemberships.organizationId, ownedOrgIds),
            ),
          )
          .limit(1);

        if (!inOrgMembership) return { status: "not_found" };
        if (admin.isSuperAdmin) return { status: "forbidden" };
      } else {
        // Super-admin path: cannot disable a super-admin at all
        if (patch.status === "disabled" && admin.isSuperAdmin) {
          const [result] = await db
            .select({ cnt: count() })
            .from(adminUsers)
            .where(and(eq(adminUsers.status, "active"), eq(adminUsers.isSuperAdmin, true)));

          if (result && result.cnt <= 1) {
            return { status: "last_super_admin" };
          }

          return { status: "forbidden" };
        }
      }

      const updates: Partial<Pick<AdminUser, "displayName" | "status">> = {};
      if (patch.displayName !== undefined) updates.displayName = patch.displayName;
      if (patch.status !== undefined) updates.status = patch.status;

      const [updated] = await db
        .update(adminUsers)
        .set(updates)
        .where(eq(adminUsers.id, adminUserId))
        .returning();

      if (patch.status === "disabled") {
        await revokeAdminSessions(db, adminUserId);
      }

      const memberships = await loadMembershipsForUser(db, adminUserId);
      return { status: "updated", admin: toAdminUserSummary(updated, memberships) };
    },

    async resetPassword(rbac, adminUserId, newPassword): Promise<ResetAdminPasswordResult> {
      const [admin] = await db
        .select({ id: adminUsers.id, isSuperAdmin: adminUsers.isSuperAdmin })
        .from(adminUsers)
        .where(eq(adminUsers.id, adminUserId))
        .limit(1);

      if (!admin) return { status: "not_found" };

      if (!canManagePlatform(rbac)) {
        // Org-owner path: target must be in their org and must not be a super-admin
        const ownedOrgIds = getOwnedOrganizationIds(rbac);
        if (ownedOrgIds.length === 0) return { status: "not_found" };

        const [inOrgMembership] = await db
          .select({ id: adminMemberships.id })
          .from(adminMemberships)
          .where(
            and(
              eq(adminMemberships.adminUserId, adminUserId),
              inArray(adminMemberships.organizationId, ownedOrgIds),
            ),
          )
          .limit(1);

        if (!inOrgMembership) return { status: "not_found" };
        if (admin.isSuperAdmin) return { status: "forbidden" };
      }

      const passwordHash = await hashPassword(newPassword);
      await db.update(adminUsers).set({ passwordHash }).where(eq(adminUsers.id, adminUserId));
      await revokeAdminSessions(db, adminUserId);

      return { status: "reset" };
    },
  };
}
