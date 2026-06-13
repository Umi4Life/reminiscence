import type { Board, Organization, Venue } from "@queue-reminiscence/db";
import type { Database } from "@queue-reminiscence/db";
import { boards, organizations, venues } from "@queue-reminiscence/db/schema";
import { and, eq, inArray, ne, or } from "drizzle-orm";

import type { CreateBoardInput, PatchBoardInput } from "./board-input";
import { patchChangesDisplayVersion } from "./board-input";
import {
  closeBoard as closeBoardOperation,
  openBoard as openBoardOperation,
  resetBoard as resetBoardOperation,
  type BoardOperationResult,
} from "./board-operations";
export type { BoardOperationResult } from "./board-operations";
import {
  canManageVenue,
  canOperateBoard,
  canReadVenue,
  type AdminMembershipContext,
  type AdminRbacContext,
} from "../auth/rbac";

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
  createBoard(rbac: AdminRbacContext, input: CreateBoardInput): Promise<CreateBoardResult>;
  updateBoard(
    rbac: AdminRbacContext,
    boardId: string,
    patch: PatchBoardInput,
  ): Promise<UpdateBoardResult>;
  openBoard(
    rbac: AdminRbacContext,
    adminUserId: string,
    boardId: string,
  ): Promise<BoardOperationResult | null>;
  closeBoard(
    rbac: AdminRbacContext,
    adminUserId: string,
    boardId: string,
  ): Promise<BoardOperationResult | null>;
  resetBoard(
    rbac: AdminRbacContext,
    adminUserId: string,
    boardId: string,
  ): Promise<BoardOperationResult | null>;
}

export type CreateBoardResult =
  | { status: "created"; board: BoardSummary }
  | { status: "venue_not_found" }
  | { status: "forbidden" }
  | { status: "conflict"; field: "slug" | "publicSlug" };

export type UpdateBoardResult =
  | { status: "updated"; board: BoardSummary }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "conflict"; field: "slug" | "publicSlug" };

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

export function toBoardSummaryFromRow(board: Board, organizationId: string): BoardSummary {
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

      return rows.map((row) => toBoardSummaryFromRow(row.board, row.venue.organizationId));
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

      return toBoardSummaryFromRow(row.board, row.venue.organizationId);
    },

    async createBoard(rbac, input): Promise<CreateBoardResult> {
      const [venue] = await db.select().from(venues).where(eq(venues.id, input.venueId)).limit(1);

      if (!venue) {
        return { status: "venue_not_found" };
      }

      if (
        !canManageVenue(rbac, {
          organizationId: venue.organizationId,
          venueId: venue.id,
        })
      ) {
        if (
          canReadVenue(rbac, {
            organizationId: venue.organizationId,
            venueId: venue.id,
          })
        ) {
          return { status: "forbidden" };
        }

        return { status: "venue_not_found" };
      }

      const [existingVenueSlug] = await db
        .select({ id: boards.id })
        .from(boards)
        .where(and(eq(boards.venueId, input.venueId), eq(boards.slug, input.slug)))
        .limit(1);

      if (existingVenueSlug) {
        return { status: "conflict", field: "slug" };
      }

      const [existingPublicSlug] = await db
        .select({ id: boards.id })
        .from(boards)
        .where(eq(boards.publicSlug, input.publicSlug))
        .limit(1);

      if (existingPublicSlug) {
        return { status: "conflict", field: "publicSlug" };
      }

      const [created] = await db
        .insert(boards)
        .values({
          venueId: input.venueId,
          slug: input.slug,
          publicSlug: input.publicSlug,
          name: input.name,
          description: input.description,
          status: input.status,
          publicViewPolicy: input.publicViewPolicy,
          publicAddPolicy: input.publicAddPolicy,
          publicRemovePolicy: input.publicRemovePolicy,
          qrRotationPolicy: input.qrRotationPolicy,
          qrRotationIntervalMinutes: input.qrRotationIntervalMinutes,
        })
        .returning();

      return {
        status: "created",
        board: toBoardSummaryFromRow(created, venue.organizationId),
      };
    },

    async updateBoard(rbac, boardId, patch): Promise<UpdateBoardResult> {
      const [row] = await db
        .select({ board: boards, venue: venues })
        .from(boards)
        .innerJoin(venues, eq(boards.venueId, venues.id))
        .where(eq(boards.id, boardId))
        .limit(1);

      if (!row) {
        return { status: "not_found" };
      }

      const resource = {
        organizationId: row.venue.organizationId,
        venueId: row.venue.id,
        boardId: row.board.id,
      };

      if (!canOperateBoard(rbac, resource)) {
        return { status: "not_found" };
      }

      if (!canManageVenue(rbac, resource)) {
        return { status: "forbidden" };
      }

      if (patch.slug !== undefined) {
        const [existingVenueSlug] = await db
          .select({ id: boards.id })
          .from(boards)
          .where(
            and(
              eq(boards.venueId, row.board.venueId),
              eq(boards.slug, patch.slug),
              ne(boards.id, boardId),
            ),
          )
          .limit(1);

        if (existingVenueSlug) {
          return { status: "conflict", field: "slug" };
        }
      }

      if (patch.publicSlug !== undefined) {
        const [existingPublicSlug] = await db
          .select({ id: boards.id })
          .from(boards)
          .where(and(eq(boards.publicSlug, patch.publicSlug), ne(boards.id, boardId)))
          .limit(1);

        if (existingPublicSlug) {
          return { status: "conflict", field: "publicSlug" };
        }
      }

      const updates: Partial<Board> = { ...patch };

      if (patchChangesDisplayVersion(patch)) {
        updates.displayVersion = row.board.displayVersion + 1;
      }

      const [updated] = await db
        .update(boards)
        .set(updates)
        .where(eq(boards.id, boardId))
        .returning();

      return {
        status: "updated",
        board: toBoardSummaryFromRow(updated, row.venue.organizationId),
      };
    },

    openBoard(rbac, adminUserId, boardId) {
      return openBoardOperation(db, rbac, adminUserId, boardId);
    },

    closeBoard(rbac, adminUserId, boardId) {
      return closeBoardOperation(db, rbac, adminUserId, boardId);
    },

    resetBoard(rbac, adminUserId, boardId) {
      return resetBoardOperation(db, rbac, adminUserId, boardId);
    },
  };
}
