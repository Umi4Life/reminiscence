import type { AdminMembership, Database } from "@queue-reminiscence/db";
import { adminMemberships, adminUsers, organizations, venues } from "@queue-reminiscence/db/schema";
import { and, count, eq, isNull } from "drizzle-orm";

import { canManageOrganization, canManagePlatform, type AdminRbacContext } from "../auth/rbac";

export type { AdminMembershipRole } from "../auth/rbac";

export interface MembershipDetail {
  id: string;
  adminUserId: string;
  organizationId: string;
  venueId: string | null;
  role: "org_owner" | "venue_manager" | "venue_staff";
  createdAt: Date;
}

export interface AssignMembershipInput {
  adminUserId: string;
  organizationId: string;
  venueId: string | null;
  role: "org_owner" | "venue_manager" | "venue_staff";
}

export type AssignMembershipResult =
  | { status: "assigned"; membership: MembershipDetail }
  | { status: "forbidden" }
  | { status: "org_not_found" }
  | { status: "venue_not_found" }
  | { status: "user_not_found" }
  | { status: "conflict" };

export type RevokeMembershipResult =
  | { status: "revoked" }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "last_owner" };

export interface MembershipManagementService {
  assignMembership(
    rbac: AdminRbacContext,
    input: AssignMembershipInput,
  ): Promise<AssignMembershipResult>;
  revokeMembership(rbac: AdminRbacContext, membershipId: string): Promise<RevokeMembershipResult>;
}

function toMembershipDetail(m: AdminMembership): MembershipDetail {
  return {
    id: m.id,
    adminUserId: m.adminUserId,
    organizationId: m.organizationId,
    venueId: m.venueId,
    role: m.role,
    createdAt: m.createdAt,
  };
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err != null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  );
}

export function createDbMembershipManagementService(db: Database): MembershipManagementService {
  return {
    async assignMembership(rbac, input): Promise<AssignMembershipResult> {
      // Quick permission gate before any DB reads
      if (!canManagePlatform(rbac) && !canManageOrganization(rbac, input.organizationId)) {
        return { status: "forbidden" };
      }

      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, input.organizationId))
        .limit(1);
      if (!org) return { status: "org_not_found" };

      const [user] = await db
        .select({ id: adminUsers.id, isSuperAdmin: adminUsers.isSuperAdmin })
        .from(adminUsers)
        .where(eq(adminUsers.id, input.adminUserId))
        .limit(1);
      if (!user) return { status: "user_not_found" };

      // Org-owners cannot assign memberships to super-admin users
      if (!canManagePlatform(rbac) && user.isSuperAdmin) {
        return { status: "forbidden" };
      }

      // Validate that venue belongs to org for venue-level assignments
      if (input.venueId !== null) {
        const [venue] = await db
          .select({ id: venues.id, organizationId: venues.organizationId })
          .from(venues)
          .where(eq(venues.id, input.venueId))
          .limit(1);
        if (!venue || venue.organizationId !== input.organizationId) {
          return { status: "venue_not_found" };
        }
      }

      try {
        const [created] = await db
          .insert(adminMemberships)
          .values({
            adminUserId: input.adminUserId,
            organizationId: input.organizationId,
            venueId: input.venueId,
            role: input.role,
          })
          .returning();
        return { status: "assigned", membership: toMembershipDetail(created) };
      } catch (err: unknown) {
        if (isUniqueConstraintError(err)) return { status: "conflict" };
        throw err;
      }
    },

    async revokeMembership(rbac, membershipId): Promise<RevokeMembershipResult> {
      const [membership] = await db
        .select()
        .from(adminMemberships)
        .where(eq(adminMemberships.id, membershipId))
        .limit(1);

      if (!membership) return { status: "not_found" };

      // Return not_found rather than forbidden to avoid leaking existence to
      // callers who lack read access to the org.
      if (!canManagePlatform(rbac) && !canManageOrganization(rbac, membership.organizationId)) {
        return { status: "not_found" };
      }

      const [targetUser] = await db
        .select({ isSuperAdmin: adminUsers.isSuperAdmin })
        .from(adminUsers)
        .where(eq(adminUsers.id, membership.adminUserId))
        .limit(1);

      if (targetUser && !canManagePlatform(rbac) && targetUser.isSuperAdmin) {
        return { status: "forbidden" };
      }

      // Prevent removing the last org_owner for an organization
      if (membership.role === "org_owner" && membership.venueId === null) {
        const [ownerCount] = await db
          .select({ count: count() })
          .from(adminMemberships)
          .where(
            and(
              eq(adminMemberships.organizationId, membership.organizationId),
              eq(adminMemberships.role, "org_owner"),
              isNull(adminMemberships.venueId),
            ),
          );

        if (ownerCount && ownerCount.count <= 1) {
          return { status: "last_owner" };
        }
      }

      await db.delete(adminMemberships).where(eq(adminMemberships.id, membershipId));

      return { status: "revoked" };
    },
  };
}
