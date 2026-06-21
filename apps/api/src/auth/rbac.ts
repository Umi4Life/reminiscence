import { forbiddenError } from "../http/errors";
import type { AdminSessionContext } from "./admin-sessions";

export type AdminMembershipRole = "org_owner" | "venue_manager" | "venue_staff";

export type AdminMembershipContext = {
  organizationId: string;
  venueId: string | null;
  role: AdminMembershipRole;
};

export type AdminRbacContext = {
  memberships: readonly AdminMembershipContext[];
  isSuperAdmin?: boolean;
};

export type VenueResourceContext = {
  organizationId: string;
  venueId: string;
};

export type MembershipAssignmentContext = {
  organizationId: string;
  venueId: string | null;
  role: AdminMembershipRole;
};

export type BoardResourceContext = VenueResourceContext & {
  boardId: string;
};

// Builds a full RBAC context from a resolved admin session. All routes should
// use this helper instead of constructing { memberships: session.memberships }
// directly so that isSuperAdmin is always threaded through.
export function toAdminRbacContext(session: AdminSessionContext): AdminRbacContext {
  return { memberships: session.memberships, isSuperAdmin: session.admin.isSuperAdmin };
}

function hasOrgOwnerMembership(
  memberships: readonly AdminMembershipContext[],
  organizationId: string,
): boolean {
  return memberships.some(
    (membership) =>
      membership.organizationId === organizationId &&
      membership.venueId === null &&
      membership.role === "org_owner",
  );
}

function findVenueMembership(
  memberships: readonly AdminMembershipContext[],
  organizationId: string,
  venueId: string,
): AdminMembershipContext | undefined {
  return memberships.find(
    (membership) => membership.organizationId === organizationId && membership.venueId === venueId,
  );
}

function hasOrganizationMembership(
  memberships: readonly AdminMembershipContext[],
  organizationId: string,
): boolean {
  if (hasOrgOwnerMembership(memberships, organizationId)) {
    return true;
  }

  return memberships.some((membership) => membership.organizationId === organizationId);
}

// Super-admin bypasses tenant resource scope only — not auth, validation,
// CSRF, rate limiting, delete guards, or audit requirements.

export function canReadOrganization(context: AdminRbacContext, organizationId: string): boolean {
  if (context.isSuperAdmin) return true;
  return hasOrganizationMembership(context.memberships, organizationId);
}

export function canManageOrganization(context: AdminRbacContext, organizationId: string): boolean {
  if (context.isSuperAdmin) return true;
  return hasOrgOwnerMembership(context.memberships, organizationId);
}

export function canReadVenue(context: AdminRbacContext, resource: VenueResourceContext): boolean {
  if (context.isSuperAdmin) return true;
  if (hasOrgOwnerMembership(context.memberships, resource.organizationId)) {
    return true;
  }

  return (
    findVenueMembership(context.memberships, resource.organizationId, resource.venueId) !==
    undefined
  );
}

export function canManageVenue(context: AdminRbacContext, resource: VenueResourceContext): boolean {
  if (context.isSuperAdmin) return true;
  if (hasOrgOwnerMembership(context.memberships, resource.organizationId)) {
    return true;
  }

  const membership = findVenueMembership(
    context.memberships,
    resource.organizationId,
    resource.venueId,
  );

  return membership?.role === "venue_manager";
}

export function canManageBoard(context: AdminRbacContext, resource: BoardResourceContext): boolean {
  return canManageVenue(context, resource);
}

export function canOperateBoard(
  context: AdminRbacContext,
  resource: BoardResourceContext,
): boolean {
  if (context.isSuperAdmin) return true;
  if (hasOrgOwnerMembership(context.memberships, resource.organizationId)) {
    return true;
  }

  const membership = findVenueMembership(
    context.memberships,
    resource.organizationId,
    resource.venueId,
  );

  return membership?.role === "venue_manager" || membership?.role === "venue_staff";
}

export function canAssignMembership(
  context: AdminRbacContext,
  assignment: MembershipAssignmentContext,
): boolean {
  if (context.isSuperAdmin) return true;
  if (hasOrgOwnerMembership(context.memberships, assignment.organizationId)) {
    return true;
  }

  if (assignment.role !== "venue_staff" || assignment.venueId === null) {
    return false;
  }

  const membership = findVenueMembership(
    context.memberships,
    assignment.organizationId,
    assignment.venueId,
  );

  return membership?.role === "venue_manager";
}

/**
 * Chain of command for CREATING an admin together with an initial membership:
 *   org_owner   → may grant org_owner, venue_manager, venue_staff in their org
 *   venue_manager → may grant venue_manager, venue_staff in their own venue
 *   venue_staff → may not create admins at all
 *
 * This governs ONLY the create-admin flow. Membership reassignment continues to
 * use `canAssignMembership`, which is intentionally stricter and left unchanged.
 * Venue-belongs-to-org is validated against the DB in the service layer.
 */
export function canCreateAdminWithMembership(
  context: AdminRbacContext,
  assignment: MembershipAssignmentContext,
): boolean {
  if (context.isSuperAdmin) return true;

  const { organizationId, venueId, role } = assignment;

  // Org-owner: may grant any role within their own org. org_owner is org-level
  // (venueId null); manager/staff are venue-level (venueId set).
  if (hasOrgOwnerMembership(context.memberships, organizationId)) {
    return role === "org_owner" ? venueId === null : venueId !== null;
  }

  // Venue-manager: may grant manager/staff in their OWN venue only — never org_owner.
  if (role !== "venue_manager" && role !== "venue_staff") return false;
  if (venueId === null) return false;
  const membership = findVenueMembership(context.memberships, organizationId, venueId);
  return membership?.role === "venue_manager";
}

/**
 * Roles the context may grant when creating an admin, given a target scope.
 * Used to drive the UI; the server still enforces `canCreateAdminWithMembership`.
 * `venueId === null` asks "what org-level roles can I grant in this org?".
 */
export function grantableCreateRoles(
  context: AdminRbacContext,
  scope: { organizationId: string; venueId: string | null },
): AdminMembershipRole[] {
  const roles: AdminMembershipRole[] = ["org_owner", "venue_manager", "venue_staff"];
  return roles.filter((role) => canCreateAdminWithMembership(context, { ...scope, role }));
}

export function canManagePlatform(context: AdminRbacContext): boolean {
  return context.isSuperAdmin === true;
}

export function assertCanReadOrganization(
  context: AdminRbacContext,
  organizationId: string,
  message?: string,
): void {
  if (!canReadOrganization(context, organizationId)) {
    throw forbiddenError(message);
  }
}

export function assertCanManageOrganization(
  context: AdminRbacContext,
  organizationId: string,
  message?: string,
): void {
  if (!canManageOrganization(context, organizationId)) {
    throw forbiddenError(message);
  }
}

export function assertCanReadVenue(
  context: AdminRbacContext,
  resource: VenueResourceContext,
  message?: string,
): void {
  if (!canReadVenue(context, resource)) {
    throw forbiddenError(message);
  }
}

export function assertCanManageVenue(
  context: AdminRbacContext,
  resource: VenueResourceContext,
  message?: string,
): void {
  if (!canManageVenue(context, resource)) {
    throw forbiddenError(message);
  }
}

export function assertCanManageBoard(
  context: AdminRbacContext,
  resource: BoardResourceContext,
  message?: string,
): void {
  if (!canManageBoard(context, resource)) {
    throw forbiddenError(message);
  }
}

export function assertCanOperateBoard(
  context: AdminRbacContext,
  resource: BoardResourceContext,
  message?: string,
): void {
  if (!canOperateBoard(context, resource)) {
    throw forbiddenError(message);
  }
}

export function assertSuperAdmin(context: AdminRbacContext, message?: string): void {
  if (!canManagePlatform(context)) {
    throw forbiddenError(message);
  }
}

// Returns the organization IDs where this context holds an org_owner role.
export function getOwnedOrganizationIds(context: AdminRbacContext): string[] {
  return context.memberships
    .filter((m) => m.role === "org_owner" && m.venueId === null)
    .map((m) => m.organizationId);
}
