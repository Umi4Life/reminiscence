import type { AdminMembership, AdminUser, Database } from "@queue-reminiscence/db";
import { adminMemberships, adminUsers, organizations, venues } from "@queue-reminiscence/db/schema";
import { and, eq } from "drizzle-orm";

import { canManagePlatform, canManageOrganization, type AdminRbacContext } from "../auth/rbac";
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
  temporaryPassword: string;
}

export interface PatchAdminInput {
  displayName?: string;
  status?: "active" | "disabled";
}

export interface AssignMembershipInput {
  adminUserId: string;
  organizationId: string;
  venueId?: string | null;
  role: "org_owner" | "venue_manager" | "venue_staff";
}

export type ListAdminsResult =
  | { status: "ok"; admins: AdminUserSummary[] }
  | { status: "forbidden" };
export type CreateAdminResult =
  | { status: "created"; admin: AdminUserSummary }
  | { status: "forbidden" }
  | { status: "conflict" };
export type GetAdminResult =
  | { status: "ok"; admin: AdminUserSummary }
  | { status: "not_found" }
  | { status: "forbidden" };
export type UpdateAdminResult =
  | { status: "updated"; admin: AdminUserSummary }
  | { status: "not_found" }
  | { status: "forbidden" };
export type ResetPasswordResult =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "forbidden" };
export type AssignMembershipResult =
  | {
      status: "assigned";
      membership: {
        id: string;
        organizationId: string;
        venueId: string | null;
        role: "org_owner" | "venue_manager" | "venue_staff";
      };
    }
  | { status: "forbidden" }
  | { status: "not_found" }
  | { status: "conflict" };
export type RevokeMembershipResult =
  | { status: "revoked" }
  | { status: "not_found" }
  | { status: "forbidden" };

export interface AdminUserManagementService {
  listAdmins(rbac: AdminRbacContext): Promise<ListAdminsResult>;
  createAdmin(rbac: AdminRbacContext, input: CreateAdminInput): Promise<CreateAdminResult>;
  getAdmin(rbac: AdminRbacContext, adminUserId: string): Promise<GetAdminResult>;
  updateAdmin(
    rbac: AdminRbacContext,
    adminUserId: string,
    patch: PatchAdminInput,
  ): Promise<UpdateAdminResult>;
  resetAdminPassword(
    rbac: AdminRbacContext,
    adminUserId: string,
    newPassword: string,
  ): Promise<ResetPasswordResult>;
  assignMembership(
    rbac: AdminRbacContext,
    input: AssignMembershipInput,
  ): Promise<AssignMembershipResult>;
  revokeMembership(rbac: AdminRbacContext, membershipId: string): Promise<RevokeMembershipResult>;
}

function toMembershipSummary(m: AdminMembership) {
  return {
    id: m.id,
    organizationId: m.organizationId,
    venueId: m.venueId,
    role: m.role,
  };
}

function toAdminUserSummary(admin: AdminUser, memberships: AdminMembership[]): AdminUserSummary {
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

export function createDbAdminUserManagementService(db: Database): AdminUserManagementService {
  return {
    async listAdmins(rbac): Promise<ListAdminsResult> {
      if (!canManagePlatform(rbac)) return { status: "forbidden" };

      const allAdmins = await db.select().from(adminUsers).orderBy(adminUsers.createdAt);
      const allMemberships = await db.select().from(adminMemberships);

      const admins: AdminUserSummary[] = allAdmins.map((admin) => {
        const memberships = allMemberships.filter((m) => m.adminUserId === admin.id);
        return toAdminUserSummary(admin, memberships);
      });

      return { status: "ok", admins };
    },

    async createAdmin(rbac, input): Promise<CreateAdminResult> {
      if (!canManagePlatform(rbac)) return { status: "forbidden" };

      const normalizedEmail = input.email.trim().toLowerCase();
      const [existing] = await db
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.email, normalizedEmail))
        .limit(1);

      if (existing) return { status: "conflict" };

      const passwordHash = await hashPassword(input.temporaryPassword);
      const [created] = await db
        .insert(adminUsers)
        .values({
          email: normalizedEmail,
          displayName: input.displayName.trim(),
          passwordHash,
          status: "active",
          isSuperAdmin: false,
        })
        .returning();

      return { status: "created", admin: toAdminUserSummary(created, []) };
    },

    async getAdmin(rbac, adminUserId): Promise<GetAdminResult> {
      if (!canManagePlatform(rbac)) return { status: "forbidden" };

      const [admin] = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.id, adminUserId))
        .limit(1);

      if (!admin) return { status: "not_found" };

      const memberships = await loadMembershipsForUser(db, adminUserId);
      return { status: "ok", admin: toAdminUserSummary(admin, memberships) };
    },

    async updateAdmin(rbac, adminUserId, patch): Promise<UpdateAdminResult> {
      if (!canManagePlatform(rbac)) return { status: "forbidden" };

      const [admin] = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.id, adminUserId))
        .limit(1);

      if (!admin) return { status: "not_found" };

      // Do not allow disabling a super admin via this endpoint
      const updateData: Partial<{ displayName: string; status: "active" | "disabled" }> = {};
      if (patch.displayName !== undefined) updateData.displayName = patch.displayName;
      if (patch.status !== undefined && !admin.isSuperAdmin) updateData.status = patch.status;

      const [updated] = await db
        .update(adminUsers)
        .set(updateData)
        .where(eq(adminUsers.id, adminUserId))
        .returning();

      const memberships = await loadMembershipsForUser(db, adminUserId);
      return { status: "updated", admin: toAdminUserSummary(updated, memberships) };
    },

    async resetAdminPassword(rbac, adminUserId, newPassword): Promise<ResetPasswordResult> {
      if (!canManagePlatform(rbac)) return { status: "forbidden" };

      const [admin] = await db
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.id, adminUserId))
        .limit(1);

      if (!admin) return { status: "not_found" };

      const passwordHash = await hashPassword(newPassword);
      await db.update(adminUsers).set({ passwordHash }).where(eq(adminUsers.id, adminUserId));

      return { status: "ok" };
    },

    async assignMembership(rbac, input): Promise<AssignMembershipResult> {
      // Super-admin can assign to any org; org-owner can only assign within their org
      const isSuperAdmin = canManagePlatform(rbac);
      if (!isSuperAdmin && !canManageOrganization(rbac, input.organizationId)) {
        return { status: "forbidden" };
      }
      // org-owners cannot assign org_owner role (only super-admin can)
      if (!isSuperAdmin && input.role === "org_owner") {
        return { status: "forbidden" };
      }

      // Check target admin exists
      const [targetAdmin] = await db
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.id, input.adminUserId))
        .limit(1);
      if (!targetAdmin) return { status: "not_found" };

      // Check org exists
      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, input.organizationId))
        .limit(1);
      if (!org) return { status: "not_found" };

      // Check venue exists if provided
      if (input.venueId) {
        const [venue] = await db
          .select({ id: venues.id })
          .from(venues)
          .where(and(eq(venues.id, input.venueId), eq(venues.organizationId, input.organizationId)))
          .limit(1);
        if (!venue) return { status: "not_found" };
      }

      // Insert — let DB unique constraint detect conflicts
      try {
        const [membership] = await db
          .insert(adminMemberships)
          .values({
            adminUserId: input.adminUserId,
            organizationId: input.organizationId,
            venueId: input.venueId ?? null,
            role: input.role,
          })
          .returning();

        return { status: "assigned", membership: toMembershipSummary(membership) };
      } catch {
        return { status: "conflict" };
      }
    },

    async revokeMembership(rbac, membershipId): Promise<RevokeMembershipResult> {
      const [membership] = await db
        .select()
        .from(adminMemberships)
        .where(eq(adminMemberships.id, membershipId))
        .limit(1);

      if (!membership) return { status: "not_found" };

      const isSuperAdmin = canManagePlatform(rbac);
      if (!isSuperAdmin && !canManageOrganization(rbac, membership.organizationId)) {
        return { status: "forbidden" };
      }

      await db.delete(adminMemberships).where(eq(adminMemberships.id, membershipId));
      return { status: "revoked" };
    },
  };
}
