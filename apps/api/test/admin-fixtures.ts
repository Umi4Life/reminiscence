import type {
  BoardManagementService,
  BoardSummary,
  OrganizationSummary,
  VenueSummary,
} from "../src/admin/board-management";
import type { AdminAuthService, AdminSessionContext } from "../src/auth/admin-sessions";
import { unauthorizedError } from "../src/http/errors";
import type { AdminMembershipContext } from "../src/auth/rbac";

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

export function createFakeBoardManagementService(): BoardManagementService {
  return {
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

      return boardsFixture.filter((board) => {
        if (hasOrgOwnerAccess(memberships, board.organizationId)) {
          return true;
        }

        return assignedVenueIds.has(board.venueId);
      });
    },

    async getBoard({ memberships }, boardId) {
      const board = boardsFixture.find((candidate) => candidate.id === boardId);

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
  };
}

export const sessionCookie = "qr_admin_session=test-session-token";
