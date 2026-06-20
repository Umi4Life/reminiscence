import type { AdminMembership, AdminUser, Database } from "@queue-reminiscence/db";
import { adminMemberships, adminSessions, adminUsers } from "@queue-reminiscence/db/schema";
import { and, count, eq, isNull } from "drizzle-orm";

import { hashPassword } from "../auth/passwords";

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

export type UpdateAdminResult =
  | { status: "updated"; admin: AdminUserSummary }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "last_super_admin" };

export type ResetAdminPasswordResult = { status: "reset" } | { status: "not_found" };

export interface AdminManagementService {
  listAdmins(): Promise<AdminUserSummary[]>;
  getAdmin(adminUserId: string): Promise<AdminUserSummary | null>;
  createAdmin(input: CreateAdminInput): Promise<CreateAdminResult>;
  updateAdmin(adminUserId: string, patch: PatchAdminInput): Promise<UpdateAdminResult>;
  resetPassword(adminUserId: string, newPassword: string): Promise<ResetAdminPasswordResult>;
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
    async listAdmins(): Promise<AdminUserSummary[]> {
      const rows = await db.select().from(adminUsers).orderBy(adminUsers.createdAt);
      const allMemberships = await db.select().from(adminMemberships);
      return rows.map((admin) =>
        toAdminUserSummary(
          admin,
          allMemberships.filter((membership) => membership.adminUserId === admin.id),
        ),
      );
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

    async updateAdmin(adminUserId: string, patch: PatchAdminInput): Promise<UpdateAdminResult> {
      const [admin] = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.id, adminUserId))
        .limit(1);

      if (!admin) {
        return { status: "not_found" };
      }

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

    async resetPassword(
      adminUserId: string,
      newPassword: string,
    ): Promise<ResetAdminPasswordResult> {
      const [admin] = await db
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.id, adminUserId))
        .limit(1);

      if (!admin) {
        return { status: "not_found" };
      }

      const passwordHash = await hashPassword(newPassword);
      await db.update(adminUsers).set({ passwordHash }).where(eq(adminUsers.id, adminUserId));
      await revokeAdminSessions(db, adminUserId);

      return { status: "reset" };
    },
  };
}
