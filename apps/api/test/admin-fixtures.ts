import type {
  BoardManagementService,
  BoardOperationResult,
  BoardSummary,
  CreateBoardResult,
  DeleteBoardResult,
  OrganizationSummary,
  UpdateBoardResult,
  VenueSummary,
} from "../src/admin/board-management";
import {
  encodeNameCursor,
  toPage,
  type ListOrgsRequest,
  type Page,
  type PageRequest,
} from "../src/http/pagination";
import type { BoardAccessService } from "../src/access/board-access";
import type { CreateBoardInput, PatchBoardInput } from "../src/admin/board-input";
import { patchChangesDisplayVersion } from "../src/admin/board-input";
import type {
  CreateOrgResult,
  DeleteOrgResult,
  OrgManagementService,
  UpdateOrgResult,
} from "../src/admin/org-management";
import type {
  CreateVenueInput,
  CreateVenueResult,
  DeleteVenueResult,
  PatchVenueInput,
  UpdateVenueResult,
  VenueManagementService,
} from "../src/admin/venue-management";
import type { AdminAuthService, AdminSessionContext } from "../src/auth/admin-sessions";
import { unauthorizedError } from "../src/http/errors";
import {
  assertCanOperateBoard,
  canManageOrganization,
  canManagePlatform,
  canManageVenue,
  canOperateBoard,
  canReadOrganization,
  canReadVenue,
  type AdminMembershipContext,
  type AdminRbacContext,
} from "../src/auth/rbac";

export const ORG_A = "00000000-0000-4000-8000-000000000001";
export const ORG_B = "00000000-0000-4000-8000-000000000002";
export const VENUE_A1 = "00000000-0000-4000-8000-000000000011";
export const VENUE_A2 = "00000000-0000-4000-8000-000000000012";
export const VENUE_B1 = "00000000-0000-4000-8000-000000000021";
export const BOARD_A1 = "00000000-0000-4000-8000-000000000101";
export const BOARD_A2 = "00000000-0000-4000-8000-000000000102";
export const BOARD_B1 = "00000000-0000-4000-8000-000000000201";

const timestamp = new Date("2026-06-01T00:00:00.000Z");

export const organizationsFixture: OrganizationSummary[] = [
  {
    id: ORG_A,
    slug: "org-a",
    name: "Organization A",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: ORG_B,
    slug: "org-b",
    name: "Organization B",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

export const venuesFixture: VenueSummary[] = [
  {
    id: VENUE_A1,
    organizationId: ORG_A,
    slug: "venue-a1",
    name: "Venue A1",
    timezone: "Asia/Bangkok",
    address: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: VENUE_A2,
    organizationId: ORG_A,
    slug: "venue-a2",
    name: "Venue A2",
    timezone: "Asia/Bangkok",
    address: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: VENUE_B1,
    organizationId: ORG_B,
    slug: "venue-b1",
    name: "Venue B1",
    timezone: "Asia/Bangkok",
    address: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

function boardSummary(
  id: string,
  venueId: string,
  organizationId: string,
  slug: string,
  name: string,
  venueName: string,
): BoardSummary {
  return {
    id,
    venueId,
    venueName,
    organizationId,
    slug,
    publicSlug: `${slug}-public`,
    name,
    description: null,
    status: "open",
    publicViewPolicy: "open",
    publicAddPolicy: "access_code_required",
    publicRemovePolicy: "access_code_required",
    qrRotationPolicy: "manual",
    qrRotationIntervalMinutes: null,
    nextSortOrder: 1,
    displayVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export const boardsFixture: BoardSummary[] = [
  boardSummary(BOARD_A1, VENUE_A1, ORG_A, "board-a1", "Board A1", "Venue A1"),
  boardSummary(BOARD_A2, VENUE_A2, ORG_A, "board-a2", "Board A2", "Venue A2"),
  boardSummary(BOARD_B1, VENUE_B1, ORG_B, "board-b1", "Board B1", "Venue B1"),
];

export const orgOwnerMembership: AdminMembershipContext = {
  organizationId: ORG_A,
  venueId: null,
  role: "org_owner",
};

export const venueManagerMembership: AdminMembershipContext = {
  organizationId: ORG_A,
  venueId: VENUE_A1,
  role: "venue_manager",
};

export const venueStaffMembership: AdminMembershipContext = {
  organizationId: ORG_A,
  venueId: VENUE_A1,
  role: "venue_staff",
};

export function createFakeAuthService(
  memberships: AdminMembershipContext[] = [orgOwnerMembership],
  options: { isSuperAdmin?: boolean } = {},
): AdminAuthService {
  const context: AdminSessionContext = {
    admin: {
      id: "admin-1",
      email: "demo@local.test",
      displayName: "Demo Admin",
      isSuperAdmin: options.isSuperAdmin ?? false,
    },
    memberships: memberships.map((membership, index) => ({
      id: `membership-${index + 1}`,
      ...membership,
    })),
  };

  return {
    async login() {
      throw new Error("not implemented in test fake");
    },

    async resolve(token: string) {
      if (token !== "test-session-token") {
        throw unauthorizedError();
      }

      return context;
    },

    async logout() {},

    async changePassword(): Promise<void> {
      throw new Error("changePassword not implemented in test fake");
    },
  };
}

function getAssignedVenueIds(memberships: readonly AdminMembershipContext[]): Set<string> {
  return new Set(
    memberships
      .filter((membership) => membership.venueId !== null)
      .map((membership) => membership.venueId as string),
  );
}

export type FakeBoardEventType = "board_opened" | "board_closed" | "board_reset";

export interface FakeBoardEvent {
  boardId: string;
  type: FakeBoardEventType;
  actorAdminUserId: string;
}

export interface FakeBoardManagementHarness {
  service: BoardManagementService & { boards: BoardSummary[] };
  boards: BoardSummary[];
  events: FakeBoardEvent[];
  resetBoards(initialBoards?: BoardSummary[]): void;
}

function cloneBoards(initialBoards: BoardSummary[]): BoardSummary[] {
  return initialBoards.map((board) => ({ ...board }));
}

export function createFakeBoardManagementService(
  initialBoards: BoardSummary[] = boardsFixture.map((board) => ({ ...board })),
): BoardManagementService & { boards: BoardSummary[] } {
  return createFakeBoardManagementHarness(initialBoards).service;
}

export function createFakeBoardManagementHarness(
  initialBoards: BoardSummary[] = boardsFixture.map((board) => ({ ...board })),
): FakeBoardManagementHarness {
  const events: FakeBoardEvent[] = [];
  const harness: FakeBoardManagementHarness = {
    boards: cloneBoards(initialBoards),
    events,
    resetBoards(nextBoards = boardsFixture.map((board) => ({ ...board }))) {
      harness.boards.splice(0, harness.boards.length, ...cloneBoards(nextBoards));
      events.splice(0, events.length);
    },
    service: undefined as unknown as BoardManagementService & { boards: BoardSummary[] },
  };

  function findBoard(boardId: string): BoardSummary | undefined {
    return harness.boards.find((candidate) => candidate.id === boardId);
  }

  function updateBoardState(boardId: string, patch: Partial<BoardSummary>): BoardSummary {
    const index = harness.boards.findIndex((candidate) => candidate.id === boardId);

    if (index === -1) {
      throw new Error(`board ${boardId} not found`);
    }

    const updated = { ...harness.boards[index], ...patch };
    harness.boards[index] = updated;
    return updated;
  }

  function recordEvent(boardId: string, type: FakeBoardEventType, actorAdminUserId: string): void {
    events.push({ boardId, type, actorAdminUserId });
  }

  function requireOperableBoard(rbac: AdminRbacContext, boardId: string): BoardSummary | null {
    const board = findBoard(boardId);

    if (!board) {
      return null;
    }

    assertCanOperateBoard(rbac, {
      boardId: board.id,
      venueId: board.venueId,
      organizationId: board.organizationId,
    });

    return board;
  }

  const service: BoardManagementService & { boards: BoardSummary[] } = {
    boards: harness.boards,

    async listOrganizations(rbac: AdminRbacContext, query: ListOrgsRequest) {
      const visible = rbac.isSuperAdmin
        ? organizationsFixture.slice()
        : organizationsFixture.filter((organization) =>
            rbac.memberships.some((m) => m.organizationId === organization.id),
          );
      return applyOrgsPage(visible, query);
    },

    async listVenues(rbac: AdminRbacContext, page: PageRequest) {
      const assignedVenueIds = getAssignedVenueIds(rbac.memberships);
      const visible = rbac.isSuperAdmin
        ? venuesFixture.slice()
        : venuesFixture.filter(
            (venue) =>
              canReadVenue(rbac, { organizationId: venue.organizationId, venueId: venue.id }) ||
              assignedVenueIds.has(venue.id),
          );
      return applyPage(visible, page);
    },

    async listBoards(rbac: AdminRbacContext, page: PageRequest) {
      const assignedVenueIds = getAssignedVenueIds(rbac.memberships);
      const visible = rbac.isSuperAdmin
        ? harness.boards.slice()
        : harness.boards.filter(
            (board) =>
              canOperateBoard(rbac, {
                boardId: board.id,
                organizationId: board.organizationId,
                venueId: board.venueId,
              }) || assignedVenueIds.has(board.venueId),
          );
      return applyPage(visible, page);
    },

    async getBoard(rbac: AdminRbacContext, boardId) {
      const board = findBoard(boardId);

      if (!board) {
        return null;
      }

      if (
        canOperateBoard(rbac, {
          boardId: board.id,
          organizationId: board.organizationId,
          venueId: board.venueId,
        })
      ) {
        return board;
      }

      return null;
    },

    async createBoard(rbac: AdminRbacContext, input: CreateBoardInput): Promise<CreateBoardResult> {
      const venue = venuesFixture.find((candidate) => candidate.id === input.venueId);

      if (!venue) {
        return { status: "venue_not_found" };
      }

      const venueResource = { organizationId: venue.organizationId, venueId: venue.id };

      if (!canManageVenue(rbac, venueResource)) {
        if (canReadVenue(rbac, venueResource)) {
          return { status: "forbidden" };
        }
        return { status: "venue_not_found" };
      }

      if (
        harness.boards.some((board) => board.venueId === input.venueId && board.slug === input.slug)
      ) {
        return { status: "conflict", field: "slug" };
      }

      if (harness.boards.some((board) => board.publicSlug === input.publicSlug)) {
        return { status: "conflict", field: "publicSlug" };
      }

      const created: BoardSummary = {
        id: crypto.randomUUID(),
        venueId: venue.id,
        venueName: venue.name,
        organizationId: venue.organizationId,
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
        nextSortOrder: 1,
        displayVersion: 1,
        createdAt: new Date("2026-06-13T00:00:00.000Z"),
        updatedAt: new Date("2026-06-13T00:00:00.000Z"),
      };

      harness.boards.push(created);

      return { status: "created", board: created };
    },

    async updateBoard(
      rbac: AdminRbacContext,
      boardId: string,
      patch: PatchBoardInput,
    ): Promise<UpdateBoardResult> {
      const boardIndex = harness.boards.findIndex((candidate) => candidate.id === boardId);

      if (boardIndex === -1) {
        return { status: "not_found" };
      }

      const board = harness.boards[boardIndex] as BoardSummary;
      const resource = {
        boardId: board.id,
        organizationId: board.organizationId,
        venueId: board.venueId,
      };

      if (!canOperateBoard(rbac, resource)) {
        return { status: "not_found" };
      }

      if (!canManageVenue(rbac, resource)) {
        return { status: "forbidden" };
      }

      if (
        patch.slug !== undefined &&
        harness.boards.some(
          (candidate) =>
            candidate.id !== boardId &&
            candidate.venueId === board.venueId &&
            candidate.slug === patch.slug,
        )
      ) {
        return { status: "conflict", field: "slug" };
      }

      if (
        patch.publicSlug !== undefined &&
        harness.boards.some(
          (candidate) => candidate.id !== boardId && candidate.publicSlug === patch.publicSlug,
        )
      ) {
        return { status: "conflict", field: "publicSlug" };
      }

      const updated: BoardSummary = {
        ...board,
        ...patch,
        displayVersion: patchChangesDisplayVersion(patch)
          ? board.displayVersion + 1
          : board.displayVersion,
        updatedAt: new Date("2026-06-13T12:00:00.000Z"),
      };

      harness.boards[boardIndex] = updated;

      return { status: "updated", board: updated };
    },

    async deleteBoard(rbac: AdminRbacContext, boardId: string): Promise<DeleteBoardResult> {
      const boardIndex = harness.boards.findIndex((candidate) => candidate.id === boardId);

      if (boardIndex === -1) {
        return { status: "not_found" };
      }

      const board = harness.boards[boardIndex] as BoardSummary;
      const resource = {
        boardId: board.id,
        organizationId: board.organizationId,
        venueId: board.venueId,
      };

      if (!canOperateBoard(rbac, resource)) {
        return { status: "not_found" };
      }

      if (!canManageVenue(rbac, resource)) {
        return { status: "forbidden" };
      }

      harness.boards.splice(boardIndex, 1);
      return { status: "deleted" };
    },

    async openBoard(
      rbac: AdminRbacContext,
      adminUserId: string,
      boardId: string,
    ): Promise<BoardOperationResult | null> {
      const board = requireOperableBoard(rbac, boardId);

      if (!board) {
        return null;
      }

      if (board.status === "open") {
        return { board, changed: false };
      }

      recordEvent(boardId, "board_opened", adminUserId);

      return {
        board: updateBoardState(boardId, {
          status: "open",
          displayVersion: board.displayVersion + 1,
        }),
        changed: true,
      };
    },

    async closeBoard(
      rbac: AdminRbacContext,
      adminUserId: string,
      boardId: string,
    ): Promise<BoardOperationResult | null> {
      const board = requireOperableBoard(rbac, boardId);

      if (!board) {
        return null;
      }

      if (board.status === "closed") {
        return { board, changed: false };
      }

      recordEvent(boardId, "board_closed", adminUserId);

      return {
        board: updateBoardState(boardId, {
          status: "closed",
          displayVersion: board.displayVersion + 1,
        }),
        changed: true,
      };
    },

    async resetBoard(
      rbac: AdminRbacContext,
      adminUserId: string,
      boardId: string,
    ): Promise<BoardOperationResult | null> {
      const board = requireOperableBoard(rbac, boardId);

      if (!board) {
        return null;
      }

      recordEvent(boardId, "board_reset", adminUserId);

      return {
        board: updateBoardState(boardId, {
          displayVersion: board.displayVersion + 1,
        }),
        changed: true,
      };
    },
  };

  harness.service = service;
  return harness;
}

export function createFakeVenueManagementService(
  initialVenues: VenueSummary[] = venuesFixture.map((v) => ({ ...v })),
  boardedVenueIds: Set<string> = new Set(),
): VenueManagementService {
  const store: VenueSummary[] = initialVenues.map((v) => ({ ...v }));

  return {
    async listVenues(rbac, page) {
      const visible = rbac.isSuperAdmin
        ? store.slice()
        : store.filter((v) =>
            canReadVenue(rbac, { organizationId: v.organizationId, venueId: v.id }),
          );
      return applyPage(visible, page);
    },

    async getVenue(rbac, venueId) {
      const v = store.find((candidate) => candidate.id === venueId);
      if (!v) return null;
      if (!canReadVenue(rbac, { organizationId: v.organizationId, venueId: v.id })) return null;
      return v;
    },

    async createVenue(rbac, input: CreateVenueInput): Promise<CreateVenueResult> {
      const org = organizationsFixture.find((o) => o.id === input.organizationId);
      if (!org) return { status: "org_not_found" };
      if (!canManageOrganization(rbac, input.organizationId)) {
        if (canReadOrganization(rbac, input.organizationId)) return { status: "forbidden" };
        return { status: "org_not_found" };
      }
      if (store.some((v) => v.organizationId === input.organizationId && v.slug === input.slug)) {
        return { status: "conflict", field: "slug" };
      }
      const created: VenueSummary = {
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        slug: input.slug,
        name: input.name,
        timezone: input.timezone,
        address: input.address,
        createdAt: new Date("2026-06-20T00:00:00.000Z"),
        updatedAt: new Date("2026-06-20T00:00:00.000Z"),
      };
      store.push(created);
      return { status: "created", venue: created };
    },

    async updateVenue(rbac, venueId, patch: PatchVenueInput): Promise<UpdateVenueResult> {
      const index = store.findIndex((v) => v.id === venueId);
      if (index === -1) return { status: "not_found" };
      const v = store[index] as VenueSummary;
      if (!canReadVenue(rbac, { organizationId: v.organizationId, venueId: v.id })) {
        return { status: "not_found" };
      }
      if (!canManageOrganization(rbac, v.organizationId)) return { status: "forbidden" };
      if (
        patch.slug !== undefined &&
        store.some(
          (candidate) =>
            candidate.id !== venueId &&
            candidate.organizationId === v.organizationId &&
            candidate.slug === patch.slug,
        )
      ) {
        return { status: "conflict", field: "slug" };
      }
      const updated = { ...v, ...patch, updatedAt: new Date("2026-06-20T12:00:00.000Z") };
      store[index] = updated;
      return { status: "updated", venue: updated };
    },

    async deleteVenue(rbac, venueId): Promise<DeleteVenueResult> {
      const index = store.findIndex((v) => v.id === venueId);
      if (index === -1) return { status: "not_found" };
      const v = store[index] as VenueSummary;
      if (!canReadVenue(rbac, { organizationId: v.organizationId, venueId: v.id })) {
        return { status: "not_found" };
      }
      if (!canManageOrganization(rbac, v.organizationId)) return { status: "forbidden" };
      if (boardedVenueIds.has(venueId)) return { status: "has_boards" };
      store.splice(index, 1);
      return { status: "deleted" };
    },
  };
}

export function createFakeOrgManagementService(
  initialOrgs: OrganizationSummary[] = organizationsFixture.map((o) => ({ ...o })),
): OrgManagementService {
  const orgs: OrganizationSummary[] = initialOrgs.map((o) => ({ ...o }));
  const ts = new Date("2026-06-01T00:00:00.000Z");

  return {
    async createOrganization(rbac, input): Promise<CreateOrgResult> {
      if (!canManagePlatform(rbac)) {
        return { status: "forbidden" };
      }
      if (orgs.some((o) => o.slug === input.slug)) {
        return { status: "conflict" };
      }
      const created: OrganizationSummary = {
        id: crypto.randomUUID(),
        slug: input.slug,
        name: input.name,
        createdAt: ts,
        updatedAt: ts,
      };
      orgs.push(created);
      return { status: "created", organization: created };
    },

    async updateOrganization(rbac, orgId, patch): Promise<UpdateOrgResult> {
      const index = orgs.findIndex((o) => o.id === orgId);
      if (index === -1) return { status: "not_found" };
      if (!canManageOrganization(rbac, orgId)) return { status: "forbidden" };
      if (patch.slug !== undefined && orgs.some((o) => o.id !== orgId && o.slug === patch.slug)) {
        return { status: "conflict" };
      }
      const updated: OrganizationSummary = {
        ...(orgs[index] as OrganizationSummary),
        ...patch,
        updatedAt: new Date("2026-06-13T12:00:00.000Z"),
      };
      orgs[index] = updated;
      return { status: "updated", organization: updated };
    },

    async deleteOrganization(rbac, orgId): Promise<DeleteOrgResult> {
      const index = orgs.findIndex((o) => o.id === orgId);
      if (index === -1) return { status: "not_found" };
      if (!canManagePlatform(rbac)) return { status: "forbidden" };
      // ORG_B is treated as non-empty in the fake (mirrors venuesFixture having VENUE_B1)
      if (orgId === ORG_B) return { status: "not_empty" };
      orgs.splice(index, 1);
      return { status: "deleted" };
    },
  };
}

function applyPage<T extends { createdAt: Date; id: string }>(
  items: T[],
  page: PageRequest,
): Page<T> {
  const sorted = [...items].sort((a, b) => {
    const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
  });
  const filtered = page.cursor
    ? sorted.filter((item) => {
        const curAt = page.cursor!.createdAt.getTime();
        const itemAt = item.createdAt.getTime();
        if (itemAt < curAt) return true;
        if (itemAt === curAt && item.id < page.cursor!.id) return true;
        return false;
      })
    : sorted;
  return toPage(filtered, page.limit);
}

function applyOrgsPage(
  items: OrganizationSummary[],
  query: ListOrgsRequest,
): Page<OrganizationSummary> {
  let list = query.search
    ? items.filter(
        (o) =>
          o.name.toLowerCase().includes(query.search!.toLowerCase()) ||
          o.slug.toLowerCase().includes(query.search!.toLowerCase()),
      )
    : items.slice();

  if (query.sort === "name_asc") {
    list = list.sort((a, b) => {
      const nc = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      return nc !== 0 ? nc : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    if (query.cursor && query.cursor.sort === "name_asc") {
      const { name: curName, id: curId } = query.cursor;
      list = list.filter((o) => {
        const nc = o.name.toLowerCase().localeCompare(curName.toLowerCase());
        return nc > 0 || (nc === 0 && o.id > curId);
      });
    }

    if (list.length <= query.limit) return { items: list, nextCursor: null };
    const page = list.slice(0, query.limit);
    const last = page[page.length - 1]!;
    return { items: page, nextCursor: encodeNameCursor(last.name, last.id) };
  }

  // createdAt_desc (default)
  list = list.sort((a, b) => {
    const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
    return timeDiff !== 0 ? timeDiff : b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
  });

  if (query.cursor && query.cursor.sort === "createdAt_desc") {
    const { createdAt: curAt, id: curId } = query.cursor;
    list = list.filter((o) => {
      const itemAt = o.createdAt.getTime();
      return itemAt < curAt.getTime() || (itemAt === curAt.getTime() && o.id < curId);
    });
  }

  return toPage(list, query.limit);
}

export const sessionCookie = "qr_admin_session=test-session-token";

export function createFakeBoardAccessService(
  overrides: Partial<BoardAccessService> = {},
): BoardAccessService {
  return {
    async rotateBoardAccessCredential() {
      return { status: "not_found" };
    },
    async getActiveBoardCredential() {
      return { status: "none" };
    },
    ...overrides,
  };
}
