import type { Board, Organization, Venue } from "@queue-reminiscence/db";
import type { Database } from "@queue-reminiscence/db";
import {
  auditMetadata,
  boardAccessCredentials,
  boardEvents,
  boards,
  displayDevices,
  organizations,
  publicBoardSessions,
  queueEntries,
  venues,
} from "@queue-reminiscence/db/schema";
import { and, asc, desc, eq, ilike, inArray, lt, ne, or, gt, sql } from "drizzle-orm";

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
import {
  encodeNameCursor,
  type ListOrgsRequest,
  type Page,
  type PageRequest,
  toPage,
} from "../http/pagination";

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
  venueName: string;
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
  listOrganizations(
    rbac: AdminRbacContext,
    query: ListOrgsRequest,
  ): Promise<Page<OrganizationSummary>>;
  listVenues(rbac: AdminRbacContext, page: PageRequest): Promise<Page<VenueSummary>>;
  listBoards(rbac: AdminRbacContext, page: PageRequest): Promise<Page<BoardSummary>>;
  getBoard(rbac: AdminRbacContext, boardId: string): Promise<BoardSummary | null>;
  createBoard(rbac: AdminRbacContext, input: CreateBoardInput): Promise<CreateBoardResult>;
  updateBoard(
    rbac: AdminRbacContext,
    boardId: string,
    patch: PatchBoardInput,
  ): Promise<UpdateBoardResult>;
  deleteBoard(rbac: AdminRbacContext, boardId: string): Promise<DeleteBoardResult>;
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

export type DeleteBoardResult =
  | { status: "deleted" }
  | { status: "not_found" }
  | { status: "forbidden" };

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

function slugifyForPrefix(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._~-]/g, "");
}

function prependVenueSlug(venueName: string, slug: string): string {
  const prefix = slugifyForPrefix(venueName);
  if (slug.startsWith(`${prefix}-`)) {
    return slug;
  }

  return `${prefix}-${slug}`;
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

export function toBoardSummaryFromRow(board: Board, venue: Venue): BoardSummary {
  return {
    id: board.id,
    venueId: board.venueId,
    venueName: venue.name,
    organizationId: venue.organizationId,
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
    async listOrganizations(
      rbac: AdminRbacContext,
      query: ListOrgsRequest,
    ): Promise<Page<OrganizationSummary>> {
      const conditions = [];

      if (!rbac.isSuperAdmin) {
        const organizationIds = getAccessibleOrganizationIds(rbac.memberships);
        if (organizationIds.length === 0) return { items: [], nextCursor: null };
        conditions.push(inArray(organizations.id, organizationIds));
      }

      if (query.search) {
        const pattern = `%${query.search}%`;
        conditions.push(
          or(ilike(organizations.name, pattern), ilike(organizations.slug, pattern))!,
        );
      }

      if (query.sort === "name_asc") {
        if (query.cursor && query.cursor.sort === "name_asc") {
          const { name: curName, id: curId } = query.cursor;
          conditions.push(
            or(
              gt(sql`lower(${organizations.name})`, curName.toLowerCase()),
              and(
                sql`lower(${organizations.name}) = ${curName.toLowerCase()}`,
                gt(organizations.id, curId),
              ),
            )!,
          );
        }
        const rows = await db
          .select()
          .from(organizations)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(sql`lower(${organizations.name})`, asc(organizations.id))
          .limit(query.limit + 1);

        if (rows.length <= query.limit) {
          return { items: rows.map(toOrganizationSummary), nextCursor: null };
        }
        const items = rows.slice(0, query.limit).map(toOrganizationSummary);
        const last = items[items.length - 1]!;
        return { items, nextCursor: encodeNameCursor(last.name, last.id) };
      }

      // Default sort: createdAt_desc
      if (query.cursor && query.cursor.sort === "createdAt_desc") {
        const { createdAt: curAt, id: curId } = query.cursor;
        conditions.push(
          or(
            lt(organizations.createdAt, curAt),
            and(eq(organizations.createdAt, curAt), lt(organizations.id, curId)),
          )!,
        );
      }

      const rows = await db
        .select()
        .from(organizations)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(organizations.createdAt), desc(organizations.id))
        .limit(query.limit + 1);

      return toPage(rows.map(toOrganizationSummary), query.limit);
    },

    async listVenues(rbac: AdminRbacContext, page: PageRequest): Promise<Page<VenueSummary>> {
      const conditions = [];

      if (!rbac.isSuperAdmin) {
        const ownedOrganizationIds = getOrgOwnedOrganizationIds(rbac.memberships);
        const assignedVenueIds = getAssignedVenueIds(rbac.memberships);

        if (ownedOrganizationIds.length === 0 && assignedVenueIds.length === 0) {
          return { items: [], nextCursor: null };
        }

        const accessConditions = [];
        if (ownedOrganizationIds.length > 0) {
          accessConditions.push(inArray(venues.organizationId, ownedOrganizationIds));
        }
        if (assignedVenueIds.length > 0) {
          accessConditions.push(inArray(venues.id, assignedVenueIds));
        }
        conditions.push(or(...accessConditions)!);
      }

      if (page.cursor) {
        const { createdAt: curAt, id: curId } = page.cursor;
        conditions.push(
          or(lt(venues.createdAt, curAt), and(eq(venues.createdAt, curAt), lt(venues.id, curId)))!,
        );
      }

      const rows = await db
        .select()
        .from(venues)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(venues.createdAt), desc(venues.id))
        .limit(page.limit + 1);

      return toPage(rows.map(toVenueSummary), page.limit);
    },

    async listBoards(rbac: AdminRbacContext, page: PageRequest): Promise<Page<BoardSummary>> {
      const conditions = [];

      if (!rbac.isSuperAdmin) {
        const ownedOrganizationIds = getOrgOwnedOrganizationIds(rbac.memberships);
        const assignedVenueIds = getAssignedVenueIds(rbac.memberships);

        if (ownedOrganizationIds.length === 0 && assignedVenueIds.length === 0) {
          return { items: [], nextCursor: null };
        }

        const accessConditions = [];
        if (ownedOrganizationIds.length > 0) {
          accessConditions.push(inArray(venues.organizationId, ownedOrganizationIds));
        }
        if (assignedVenueIds.length > 0) {
          accessConditions.push(inArray(boards.venueId, assignedVenueIds));
        }
        conditions.push(or(...accessConditions)!);
      }

      if (page.cursor) {
        const { createdAt: curAt, id: curId } = page.cursor;
        conditions.push(
          or(lt(boards.createdAt, curAt), and(eq(boards.createdAt, curAt), lt(boards.id, curId)))!,
        );
      }

      const rows = await db
        .select({ board: boards, venue: venues })
        .from(boards)
        .innerJoin(venues, eq(boards.venueId, venues.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(boards.createdAt), desc(boards.id))
        .limit(page.limit + 1);

      return toPage(
        rows.map((row) => toBoardSummaryFromRow(row.board, row.venue)),
        page.limit,
      );
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

      return toBoardSummaryFromRow(row.board, row.venue);
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

      const normalizedSlug = prependVenueSlug(venue.name, input.slug);
      const normalizedPublicSlug = prependVenueSlug(venue.name, input.publicSlug);

      const [existingVenueSlug] = await db
        .select({ id: boards.id })
        .from(boards)
        .where(and(eq(boards.venueId, input.venueId), eq(boards.slug, normalizedSlug)))
        .limit(1);

      if (existingVenueSlug) {
        return { status: "conflict", field: "slug" };
      }

      const [existingPublicSlug] = await db
        .select({ id: boards.id })
        .from(boards)
        .where(eq(boards.publicSlug, normalizedPublicSlug))
        .limit(1);

      if (existingPublicSlug) {
        return { status: "conflict", field: "publicSlug" };
      }

      const [created] = await db
        .insert(boards)
        .values({
          venueId: input.venueId,
          slug: normalizedSlug,
          publicSlug: normalizedPublicSlug,
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
        board: toBoardSummaryFromRow(created, venue),
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
        board: toBoardSummaryFromRow(updated, row.venue),
      };
    },

    async deleteBoard(rbac, boardId): Promise<DeleteBoardResult> {
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

      await db.transaction(async (tx) => {
        const eventIds = await tx
          .select({ id: boardEvents.id })
          .from(boardEvents)
          .where(eq(boardEvents.boardId, boardId));

        if (eventIds.length > 0) {
          await tx.delete(auditMetadata).where(
            inArray(
              auditMetadata.eventId,
              eventIds.map((e) => e.id),
            ),
          );
        }

        await tx
          .update(queueEntries)
          .set({ removedByEventId: null })
          .where(eq(queueEntries.boardId, boardId));

        await tx.delete(boardEvents).where(eq(boardEvents.boardId, boardId));
        await tx.delete(queueEntries).where(eq(queueEntries.boardId, boardId));
        await tx.delete(publicBoardSessions).where(eq(publicBoardSessions.boardId, boardId));
        await tx.delete(boardAccessCredentials).where(eq(boardAccessCredentials.boardId, boardId));
        await tx.delete(displayDevices).where(eq(displayDevices.boardId, boardId));
        await tx.delete(boards).where(eq(boards.id, boardId));
      });

      return { status: "deleted" };
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
