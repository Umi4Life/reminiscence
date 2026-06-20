import type { AdminUser, Database } from "@queue-reminiscence/db";
import { adminSessions, adminUsers } from "@queue-reminiscence/db/schema";
import { and, count, eq, isNull } from "drizzle-orm";

import { hashPassword } from "../auth/passwords";

export interface AdminUserSummary {
  id: string;
  email: string;
  displayName: string;
  status: "active" | "disabled";
  isSuperAdmin: boolean;
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
  createAdmin(input: CreateAdminInput): Promise<CreateAdminResult>;
  updateAdmin(adminUserId: string, patch: PatchAdminInput): Promise<UpdateAdminResult>;
  resetPassword(adminUserId: string, newPassword: string): Promise<ResetAdminPasswordResult>;
}

function toAdminUserSummary(admin: AdminUser): AdminUserSummary {
  return {
    id: admin.id,
    email: admin.email,
    displayName: admin.displayName,
    status: admin.status,
    isSuperAdmin: admin.isSuperAdmin,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
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
      const rows = await db.select().from(adminUsers);
      return rows.map(toAdminUserSummary);
    },

    async createAdmin(input: CreateAdminInput): Promise<CreateAdminResult> {
      const [existing] = await db
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.email, input.email))
        .limit(1);

      if (existing) {
        return { status: "conflict" };
      }

      const passwordHash = await hashPassword(input.password);

      const [created] = await db
        .insert(adminUsers)
        .values({
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          status: input.status,
          isSuperAdmin: false,
        })
        .returning();

      return { status: "created", admin: toAdminUserSummary(created) };
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

      return { status: "updated", admin: toAdminUserSummary(updated) };
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
