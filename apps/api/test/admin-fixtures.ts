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
import type { CreateBoardInput, PatchBoardInput } from "../src/admin/board-input";
import { patchChangesDisplayVersion } from "../src/admin/board-input";
import type { AdminAuthService, AdminSessionContext } from "../src/auth/admin-sessions";
import { unauthorizedError } from "../src/http/errors";
import { assertCanOperateBoard, type AdminMembershipContext } from "../src/auth/rbac";

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
): BoardSummary {
  return {
    id,
    venueId,
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
  boardSummary(BOARD_A1, VENUE_A1, ORG_A, "board-a1", "Board A1"),
  boardSummary(BOARD_A2, VENUE_A2, ORG_A, "board-a2", "Board A2"),
  boardSummary(BOARD_B1, VENUE_B1, ORG_B, "board-b1", "Board B1"),
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
): AdminAuthService {
  const context: AdminSessionContext = {
    admin: {
      id: "admin-1",
      email: "demo@local.test",
      displayName: "Demo Admin",
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

function hasOrgOwnerAccess(
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

function getAssignedVenueIds(memberships: readonly AdminMembershipContext[]): Set<string> {
  return new Set(
    memberships
      .filter((membership) => membership.venueId !== null)
      .map((membership) => membership.venueId as string),
  );
}

function canManageVenueForMemberships(
  memberships: readonly AdminMembershipContext[],
  organizationId: string,
  venueId: string,
): boolean {
  if (hasOrgOwnerAccess(memberships, organizationId)) {
    return true;
  }

  return memberships.some(
    (membership) =>
      membership.organizationId === organizationId &&
      membership.venueId === venueId &&
      membership.role === "venue_manager",
  );
}

function canReadVenueForMemberships(
  memberships: readonly AdminMembershipContext[],
  organizationId: string,
  venueId: string,
): boolean {
  if (hasOrgOwnerAccess(memberships, organizationId)) {
    return true;
  }

  return memberships.some(
    (membership) => membership.organizationId === organizationId && membership.venueId === venueId,
  );
}

function canOperateBoardForMemberships(
  memberships: readonly AdminMembershipContext[],
  board: BoardSummary,
): boolean {
  if (hasOrgOwnerAccess(memberships, board.organizationId)) {
    return true;
  }

  return getAssignedVenueIds(memberships).has(board.venueId);
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

  function requireOperableBoard(
    rbac: { memberships: readonly AdminMembershipContext[] },
    boardId: string,
  ): BoardSummary | null {
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

    async listOrganizations({ memberships }) {
      const organizationIds = new Set(memberships.map((membership) => membership.organizationId));

      return organizationsFixture.filter((organization) => organizationIds.has(organization.id));
    },

    async listVenues({ memberships }) {
      const assignedVenueIds = getAssignedVenueIds(memberships);

      return venuesFixture.filter((venue) => {
        if (hasOrgOwnerAccess(memberships, venue.organizationId)) {
          return true;
        }

        return assignedVenueIds.has(venue.id);
      });
    },

    async listBoards({ memberships }) {
      const assignedVenueIds = getAssignedVenueIds(memberships);

      return harness.boards.filter((board) => {
        if (hasOrgOwnerAccess(memberships, board.organizationId)) {
          return true;
        }

        return assignedVenueIds.has(board.venueId);
      });
    },

    async getBoard({ memberships }, boardId) {
      const board = findBoard(boardId);

      if (!board) {
        return null;
      }

      if (hasOrgOwnerAccess(memberships, board.organizationId)) {
        return board;
      }

      if (getAssignedVenueIds(memberships).has(board.venueId)) {
        return board;
      }

      return null;
    },

    async createBoard({ memberships }, input: CreateBoardInput): Promise<CreateBoardResult> {
      const venue = venuesFixture.find((candidate) => candidate.id === input.venueId);

      if (!venue) {
        return { status: "venue_not_found" };
      }

      if (!canManageVenueForMemberships(memberships, venue.organizationId, venue.id)) {
        if (canReadVenueForMemberships(memberships, venue.organizationId, venue.id)) {
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
      { memberships },
      boardId: string,
      patch: PatchBoardInput,
    ): Promise<UpdateBoardResult> {
      const boardIndex = harness.boards.findIndex((candidate) => candidate.id === boardId);

      if (boardIndex === -1) {
        return { status: "not_found" };
      }

      const board = harness.boards[boardIndex] as BoardSummary;

      if (!canOperateBoardForMemberships(memberships, board)) {
        return { status: "not_found" };
      }

      if (!canManageVenueForMemberships(memberships, board.organizationId, board.venueId)) {
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

    async deleteBoard(
      { memberships }: { memberships: readonly AdminMembershipContext[] },
      boardId: string,
    ): Promise<DeleteBoardResult> {
      const boardIndex = harness.boards.findIndex((candidate) => candidate.id === boardId);

      if (boardIndex === -1) {
        return { status: "not_found" };
      }

      const board = harness.boards[boardIndex] as BoardSummary;

      if (!canOperateBoardForMemberships(memberships, board)) {
        return { status: "not_found" };
      }

      if (!canManageVenueForMemberships(memberships, board.organizationId, board.venueId)) {
        return { status: "forbidden" };
      }

      harness.boards.splice(boardIndex, 1);
      return { status: "deleted" };
    },

    async openBoard(
      rbac: { memberships: readonly AdminMembershipContext[] },
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
      rbac: { memberships: readonly AdminMembershipContext[] },
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
      rbac: { memberships: readonly AdminMembershipContext[] },
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

export const sessionCookie = "qr_admin_session=test-session-token";
