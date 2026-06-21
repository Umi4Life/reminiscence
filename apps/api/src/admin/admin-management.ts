import type { AdminMembership, AdminUser, Database } from "@queue-reminiscence/db";
import {
  adminMemberships,
  adminSessions,
  adminUsers,
  organizations,
  venues,
} from "@queue-reminiscence/db/schema";
import { and, count, eq, inArray, isNull, or } from "drizzle-orm";

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
  // Optional initial membership granted atomically with the user. Required when
  // a non-super-admin creates an admin (so it lands inside their scope); omitted
  // means a bare platform admin (super-admin only — gated in the route).
  membership?: {
    organizationId: string;
    venueId: string | null;
    role: "org_owner" | "venue_manager" | "venue_staff";
  };
}

export interface PatchAdminInput {
  displayName?: string;
  status?: "active" | "disabled";
}

export type CreateAdminResult =
  | { status: "created"; admin: AdminUserSummary }
  | { status: "conflict" }
  | { status: "org_not_found" }
  | { status: "venue_not_found" };

export type ListAdminsResult =
  | { status: "ok"; admins: AdminUserSummary[] }
  | { status: "forbidden" };

export type UpdateAdminResult =
  | { status: "updated"; admin: AdminUserSummary }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "last_super_admin" }
  | { status: "self_disable" };

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
    actorAdminUserId: string,
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

      // Non-super: scope to admins the caller can see. Org-owners see their whole
      // org; venue-managers see their own venue(s). Only the in-scope memberships
      // are returned, so other-org/venue memberships are never leaked.
      const ownedOrgIds = getOwnedOrganizationIds(rbac);
      const managedVenueIds = rbac.memberships
        .filter((m) => m.role === "venue_manager" && m.venueId !== null)
        .map((m) => m.venueId as string);

      if (ownedOrgIds.length === 0 && managedVenueIds.length === 0) {
        return { status: "forbidden" };
      }

      const scopeMemberships = await db
        .select()
        .from(adminMemberships)
        .where(
          or(
            ownedOrgIds.length > 0
              ? inArray(adminMemberships.organizationId, ownedOrgIds)
              : undefined,
            managedVenueIds.length > 0
              ? inArray(adminMemberships.venueId, managedVenueIds)
              : undefined,
          ),
        );

      if (scopeMemberships.length === 0) return { status: "ok", admins: [] };

      const adminUserIds = [...new Set(scopeMemberships.map((m) => m.adminUserId))];

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
            scopeMemberships.filter((m) => m.adminUserId === admin.id),
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

      // Validate the initial membership scope before writing anything.
      const membership = input.membership;
      if (membership) {
        const [org] = await db
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.id, membership.organizationId))
          .limit(1);
        if (!org) return { status: "org_not_found" };

        if (membership.venueId !== null) {
          const [venue] = await db
            .select({ id: venues.id, organizationId: venues.organizationId })
            .from(venues)
            .where(eq(venues.id, membership.venueId))
            .limit(1);
          if (!venue || venue.organizationId !== membership.organizationId) {
            return { status: "venue_not_found" };
          }
        }
      }

      const passwordHash = await hashPassword(input.password);

      // Create the user and (if requested) its initial membership atomically, so
      // a non-super-admin never ends up with an orphan admin they can't see.
      const { created, memberships } = await db.transaction(async (tx) => {
        const [user] = await tx
          .insert(adminUsers)
          .values({
            email: normalizedEmail,
            displayName: input.displayName.trim(),
            passwordHash,
            status: input.status,
            isSuperAdmin: false,
          })
          .returning();

        if (!membership) return { created: user, memberships: [] as AdminMembership[] };

        const [createdMembership] = await tx
          .insert(adminMemberships)
          .values({
            adminUserId: user.id,
            organizationId: membership.organizationId,
            venueId: membership.venueId,
            role: membership.role,
          })
          .returning();

        return { created: user, memberships: [createdMembership] };
      });

      return { status: "created", admin: toAdminUserSummary(created, memberships) };
    },

    async updateAdmin(rbac, adminUserId, patch, actorAdminUserId): Promise<UpdateAdminResult> {
      // Foolproof self-lockout guard: an admin can never disable their own
      // account, regardless of role. Checked before any DB work so it can't be
      // bypassed by permission edge cases.
      if (patch.status === "disabled" && adminUserId === actorAdminUserId) {
        return { status: "self_disable" };
      }

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
