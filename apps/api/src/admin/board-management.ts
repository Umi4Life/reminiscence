import type { Board, Organization, Venue } from "@queue-reminiscence/db";
import type { Database } from "@queue-reminiscence/db";
import { boards, organizations, venues } from "@queue-reminiscence/db/schema";
import { eq, inArray, or } from "drizzle-orm";

import { canOperateBoard, type AdminMembershipContext, type AdminRbacContext } from "../auth/rbac";

export interface OrganizationSummary {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VenueSummary {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  timezone: string;
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BoardSummary {
  id: string;
  venueId: string;
  organizationId: string;
  slug: string;
  publicSlug: string;
  name: string;
  description: string | null;
  status: Board["status"];
  publicViewPolicy: Board["publicViewPolicy"];
  publicAddPolicy: Board["publicAddPolicy"];
  publicRemovePolicy: Board["publicRemovePolicy"];
  qrRotationPolicy: Board["qrRotationPolicy"];
  qrRotationIntervalMinutes: number | null;
  nextSortOrder: number;
  displayVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BoardManagementService {
  listOrganizations(rbac: AdminRbacContext): Promise<OrganizationSummary[]>;
  listVenues(rbac: AdminRbacContext): Promise<VenueSummary[]>;
  listBoards(rbac: AdminRbacContext): Promise<BoardSummary[]>;
  getBoard(rbac: AdminRbacContext, boardId: string): Promise<BoardSummary | null>;
}

function getAccessibleOrganizationIds(memberships: readonly AdminMembershipContext[]): string[] {
  return [...new Set(memberships.map((membership) => membership.organizationId))];
}

function getOrgOwnedOrganizationIds(memberships: readonly AdminMembershipContext[]): string[] {
  return [
    ...new Set(
      memberships
        .filter((membership) => membership.venueId === null && membership.role === "org_owner")
        .map((membership) => membership.organizationId),
    ),
  ];
}

function getAssignedVenueIds(memberships: readonly AdminMembershipContext[]): string[] {
  return [
    ...new Set(
      memberships
        .filter((membership) => membership.venueId !== null)
        .map((membership) => membership.venueId as string),
    ),
  ];
}

function toOrganizationSummary(organization: Organization): OrganizationSummary {
  return {
    id: organization.id,
    slug: organization.slug,
    name: organization.name,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  };
}

function toVenueSummary(venue: Venue): VenueSummary {
  return {
    id: venue.id,
    organizationId: venue.organizationId,
    slug: venue.slug,
    name: venue.name,
    timezone: venue.timezone,
    address: venue.address,
    createdAt: venue.createdAt,
    updatedAt: venue.updatedAt,
  };
}

function toBoardSummary(board: Board, organizationId: string): BoardSummary {
  return {
    id: board.id,
    venueId: board.venueId,
    organizationId,
    slug: board.slug,
    publicSlug: board.publicSlug,
    name: board.name,
    description: board.description,
    status: board.status,
    publicViewPolicy: board.publicViewPolicy,
    publicAddPolicy: board.publicAddPolicy,
    publicRemovePolicy: board.publicRemovePolicy,
    qrRotationPolicy: board.qrRotationPolicy,
    qrRotationIntervalMinutes: board.qrRotationIntervalMinutes,
    nextSortOrder: board.nextSortOrder,
    displayVersion: board.displayVersion,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
}

export function createDbBoardManagementService(db: Database): BoardManagementService {
  return {
    async listOrganizations(rbac: AdminRbacContext): Promise<OrganizationSummary[]> {
      const organizationIds = getAccessibleOrganizationIds(rbac.memberships);

      if (organizationIds.length === 0) {
        return [];
      }

      const rows = await db
        .select()
        .from(organizations)
        .where(inArray(organizations.id, organizationIds));

      return rows.map(toOrganizationSummary);
    },

    async listVenues(rbac: AdminRbacContext): Promise<VenueSummary[]> {
      const ownedOrganizationIds = getOrgOwnedOrganizationIds(rbac.memberships);
      const assignedVenueIds = getAssignedVenueIds(rbac.memberships);

      if (ownedOrganizationIds.length === 0 && assignedVenueIds.length === 0) {
        return [];
      }

      const accessConditions = [];

      if (ownedOrganizationIds.length > 0) {
        accessConditions.push(inArray(venues.organizationId, ownedOrganizationIds));
      }

      if (assignedVenueIds.length > 0) {
        accessConditions.push(inArray(venues.id, assignedVenueIds));
      }

      const rows = await db
        .select()
        .from(venues)
        .where(or(...accessConditions));

      return rows.map(toVenueSummary);
    },

    async listBoards(rbac: AdminRbacContext): Promise<BoardSummary[]> {
      const ownedOrganizationIds = getOrgOwnedOrganizationIds(rbac.memberships);
      const assignedVenueIds = getAssignedVenueIds(rbac.memberships);

      if (ownedOrganizationIds.length === 0 && assignedVenueIds.length === 0) {
        return [];
      }

      const accessConditions = [];

      if (ownedOrganizationIds.length > 0) {
        accessConditions.push(inArray(venues.organizationId, ownedOrganizationIds));
      }

      if (assignedVenueIds.length > 0) {
        accessConditions.push(inArray(boards.venueId, assignedVenueIds));
      }

      const rows = await db
        .select({ board: boards, venue: venues })
        .from(boards)
        .innerJoin(venues, eq(boards.venueId, venues.id))
        .where(or(...accessConditions));

      return rows.map((row) => toBoardSummary(row.board, row.venue.organizationId));
    },

    async getBoard(rbac: AdminRbacContext, boardId: string): Promise<BoardSummary | null> {
      const [row] = await db
        .select({ board: boards, venue: venues })
        .from(boards)
        .innerJoin(venues, eq(boards.venueId, venues.id))
        .where(eq(boards.id, boardId))
        .limit(1);

      if (!row) {
        return null;
      }

      const canRead = canOperateBoard(rbac, {
        organizationId: row.venue.organizationId,
        venueId: row.venue.id,
        boardId: row.board.id,
      });

      if (!canRead) {
        return null;
      }

      return toBoardSummary(row.board, row.venue.organizationId);
    },
  };
}
