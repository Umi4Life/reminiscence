import type { Venue } from "@queue-reminiscence/db";
import type { Database } from "@queue-reminiscence/db";
import { boards, organizations, venues } from "@queue-reminiscence/db/schema";
import { and, count, desc, eq, inArray, lt, ne, or } from "drizzle-orm";

import {
  canManageOrganization,
  canReadOrganization,
  canReadVenue,
  type AdminMembershipContext,
  type AdminRbacContext,
} from "../auth/rbac";

import type { VenueSummary } from "./board-management";
import { type Page, type PageRequest, toPage } from "../http/pagination";

export interface CreateVenueInput {
  organizationId: string;
  slug: string;
  name: string;
  timezone: string;
  address: string | null;
}

export interface PatchVenueInput {
  slug?: string;
  name?: string;
  timezone?: string;
  address?: string | null;
}

export type CreateVenueResult =
  | { status: "created"; venue: VenueSummary }
  | { status: "org_not_found" }
  | { status: "forbidden" }
  | { status: "conflict"; field: "slug" };

export type UpdateVenueResult =
  | { status: "updated"; venue: VenueSummary }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "conflict"; field: "slug" };

export type DeleteVenueResult =
  | { status: "deleted" }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "has_boards" };

export interface VenueManagementService {
  listVenues(rbac: AdminRbacContext, page: PageRequest): Promise<Page<VenueSummary>>;
  getVenue(rbac: AdminRbacContext, venueId: string): Promise<VenueSummary | null>;
  createVenue(rbac: AdminRbacContext, input: CreateVenueInput): Promise<CreateVenueResult>;
  updateVenue(
    rbac: AdminRbacContext,
    venueId: string,
    patch: PatchVenueInput,
  ): Promise<UpdateVenueResult>;
  deleteVenue(rbac: AdminRbacContext, venueId: string): Promise<DeleteVenueResult>;
}

function getOrgOwnedOrganizationIds(memberships: readonly AdminMembershipContext[]): string[] {
  return [
    ...new Set(
      memberships
        .filter((m) => m.venueId === null && m.role === "org_owner")
        .map((m) => m.organizationId),
    ),
  ];
}

function getAssignedVenueIds(memberships: readonly AdminMembershipContext[]): string[] {
  return [
    ...new Set(memberships.filter((m) => m.venueId !== null).map((m) => m.venueId as string)),
  ];
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

export function createDbVenueManagementService(db: Database): VenueManagementService {
  return {
    async listVenues(rbac, page): Promise<Page<VenueSummary>> {
      const conditions = [];

      if (!rbac.isSuperAdmin) {
        const ownedOrgIds = getOrgOwnedOrganizationIds(rbac.memberships);
        const assignedVenueIds = getAssignedVenueIds(rbac.memberships);

        if (ownedOrgIds.length === 0 && assignedVenueIds.length === 0) {
          return { items: [], nextCursor: null };
        }

        const accessConditions = [];
        if (ownedOrgIds.length > 0) {
          accessConditions.push(inArray(venues.organizationId, ownedOrgIds));
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

    async getVenue(rbac, venueId): Promise<VenueSummary | null> {
      const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);

      if (!venue) return null;

      if (!canReadVenue(rbac, { organizationId: venue.organizationId, venueId: venue.id })) {
        return null;
      }

      return toVenueSummary(venue);
    },

    async createVenue(rbac, input): Promise<CreateVenueResult> {
      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, input.organizationId))
        .limit(1);

      if (!org) {
        return { status: "org_not_found" };
      }

      if (!canManageOrganization(rbac, input.organizationId)) {
        if (canReadOrganization(rbac, input.organizationId)) {
          return { status: "forbidden" };
        }
        return { status: "org_not_found" };
      }

      const [existingSlug] = await db
        .select({ id: venues.id })
        .from(venues)
        .where(and(eq(venues.organizationId, input.organizationId), eq(venues.slug, input.slug)))
        .limit(1);

      if (existingSlug) {
        return { status: "conflict", field: "slug" };
      }

      const [created] = await db
        .insert(venues)
        .values({
          organizationId: input.organizationId,
          slug: input.slug,
          name: input.name,
          timezone: input.timezone,
          address: input.address,
        })
        .returning();

      return { status: "created", venue: toVenueSummary(created) };
    },

    async updateVenue(rbac, venueId, patch): Promise<UpdateVenueResult> {
      const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);

      if (!venue) return { status: "not_found" };

      const resource = { organizationId: venue.organizationId, venueId: venue.id };

      if (!canReadVenue(rbac, resource)) {
        return { status: "not_found" };
      }

      if (!canManageOrganization(rbac, venue.organizationId)) {
        return { status: "forbidden" };
      }

      if (patch.slug !== undefined) {
        const [existingSlug] = await db
          .select({ id: venues.id })
          .from(venues)
          .where(
            and(
              eq(venues.organizationId, venue.organizationId),
              eq(venues.slug, patch.slug),
              ne(venues.id, venueId),
            ),
          )
          .limit(1);

        if (existingSlug) {
          return { status: "conflict", field: "slug" };
        }
      }

      const [updated] = await db
        .update(venues)
        .set({ ...patch })
        .where(eq(venues.id, venueId))
        .returning();

      return { status: "updated", venue: toVenueSummary(updated) };
    },

    async deleteVenue(rbac, venueId): Promise<DeleteVenueResult> {
      const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);

      if (!venue) return { status: "not_found" };

      const resource = { organizationId: venue.organizationId, venueId: venue.id };

      if (!canReadVenue(rbac, resource)) {
        return { status: "not_found" };
      }

      if (!canManageOrganization(rbac, venue.organizationId)) {
        return { status: "forbidden" };
      }

      const [boardCheck] = await db
        .select({ count: count() })
        .from(boards)
        .where(eq(boards.venueId, venueId));

      if (boardCheck && boardCheck.count > 0) {
        return { status: "has_boards" };
      }

      await db.delete(venues).where(eq(venues.id, venueId));

      return { status: "deleted" };
    },
  };
}
