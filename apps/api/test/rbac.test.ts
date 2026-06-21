import { describe, expect, test } from "bun:test";

import {
  assertCanManageBoard,
  assertCanManageOrganization,
  assertCanManageVenue,
  assertCanOperateBoard,
  assertCanReadOrganization,
  assertCanReadVenue,
  assertSuperAdmin,
  canManageBoard,
  canManageOrganization,
  canCreateAdminWithMembership,
  canManagePlatform,
  canManageVenue,
  canOperateBoard,
  canReadOrganization,
  canReadVenue,
  getOwnedOrganizationIds,
  grantableCreateRoles,
  type AdminMembershipContext,
  type AdminRbacContext,
  type BoardResourceContext,
  type VenueResourceContext,
} from "../src/auth/rbac";
import { forbiddenError } from "../src/http/errors";

const ORG_A = "org-a";
const ORG_B = "org-b";
const VENUE_A1 = "venue-a1";
const VENUE_A2 = "venue-a2";
const BOARD_A1 = "board-a1";

function membership(
  organizationId: string,
  venueId: string | null,
  role: AdminMembershipContext["role"],
): AdminMembershipContext {
  return { organizationId, venueId, role };
}

function context(...memberships: AdminMembershipContext[]): AdminRbacContext {
  return { memberships };
}

const orgOwnerMembership = membership(ORG_A, null, "org_owner");
const venueManagerMembership = membership(ORG_A, VENUE_A1, "venue_manager");
const venueStaffMembership = membership(ORG_A, VENUE_A1, "venue_staff");

const venueA1: VenueResourceContext = { organizationId: ORG_A, venueId: VENUE_A1 };
const venueA2: VenueResourceContext = { organizationId: ORG_A, venueId: VENUE_A2 };
const venueB1: VenueResourceContext = { organizationId: ORG_B, venueId: "venue-b1" };

const boardA1: BoardResourceContext = {
  organizationId: ORG_A,
  venueId: VENUE_A1,
  boardId: BOARD_A1,
};

const boardA2: BoardResourceContext = {
  organizationId: ORG_A,
  venueId: VENUE_A2,
  boardId: "board-a2",
};

type BooleanCase = {
  name: string;
  admin: AdminRbacContext;
  expected: boolean;
};

describe("admin RBAC helpers", () => {
  describe("canReadOrganization", () => {
    const cases: Array<BooleanCase & { organizationId: string }> = [
      {
        name: "org_owner can read own organization",
        admin: context(orgOwnerMembership),
        organizationId: ORG_A,
        expected: true,
      },
      {
        name: "venue_manager can read organization context",
        admin: context(venueManagerMembership),
        organizationId: ORG_A,
        expected: true,
      },
      {
        name: "venue_staff can read organization context",
        admin: context(venueStaffMembership),
        organizationId: ORG_A,
        expected: true,
      },
      {
        name: "org_owner cannot read a different organization",
        admin: context(orgOwnerMembership),
        organizationId: ORG_B,
        expected: false,
      },
      {
        name: "venue_manager cannot read a different organization",
        admin: context(venueManagerMembership),
        organizationId: ORG_B,
        expected: false,
      },
    ];

    for (const testCase of cases) {
      test(testCase.name, () => {
        expect(canReadOrganization(testCase.admin, testCase.organizationId)).toBe(
          testCase.expected,
        );
      });
    }
  });

  describe("canManageOrganization", () => {
    const cases: Array<BooleanCase & { organizationId: string }> = [
      {
        name: "org_owner can manage own organization",
        admin: context(orgOwnerMembership),
        organizationId: ORG_A,
        expected: true,
      },
      {
        name: "venue_manager cannot manage organization",
        admin: context(venueManagerMembership),
        organizationId: ORG_A,
        expected: false,
      },
      {
        name: "venue_staff cannot manage organization",
        admin: context(venueStaffMembership),
        organizationId: ORG_A,
        expected: false,
      },
      {
        name: "org_owner cannot manage a different organization",
        admin: context(orgOwnerMembership),
        organizationId: ORG_B,
        expected: false,
      },
    ];

    for (const testCase of cases) {
      test(testCase.name, () => {
        expect(canManageOrganization(testCase.admin, testCase.organizationId)).toBe(
          testCase.expected,
        );
      });
    }
  });

  describe("canReadVenue", () => {
    const cases: Array<BooleanCase & { resource: VenueResourceContext }> = [
      {
        name: "org_owner can read any venue in organization",
        admin: context(orgOwnerMembership),
        resource: venueA2,
        expected: true,
      },
      {
        name: "venue_manager can read assigned venue",
        admin: context(venueManagerMembership),
        resource: venueA1,
        expected: true,
      },
      {
        name: "venue_staff can read assigned venue",
        admin: context(venueStaffMembership),
        resource: venueA1,
        expected: true,
      },
      {
        name: "venue_manager cannot read unassigned venue in same organization",
        admin: context(venueManagerMembership),
        resource: venueA2,
        expected: false,
      },
      {
        name: "venue_staff cannot read venue in different organization",
        admin: context(venueStaffMembership),
        resource: venueB1,
        expected: false,
      },
    ];

    for (const testCase of cases) {
      test(testCase.name, () => {
        expect(canReadVenue(testCase.admin, testCase.resource)).toBe(testCase.expected);
      });
    }
  });

  describe("canManageVenue", () => {
    const cases: Array<BooleanCase & { resource: VenueResourceContext }> = [
      {
        name: "org_owner can manage any venue in organization",
        admin: context(orgOwnerMembership),
        resource: venueA2,
        expected: true,
      },
      {
        name: "venue_manager can manage assigned venue",
        admin: context(venueManagerMembership),
        resource: venueA1,
        expected: true,
      },
      {
        name: "venue_staff cannot manage assigned venue",
        admin: context(venueStaffMembership),
        resource: venueA1,
        expected: false,
      },
      {
        name: "venue_manager cannot manage unassigned venue",
        admin: context(venueManagerMembership),
        resource: venueA2,
        expected: false,
      },
      {
        name: "venue_manager cannot manage venue in different organization",
        admin: context(venueManagerMembership),
        resource: venueB1,
        expected: false,
      },
    ];

    for (const testCase of cases) {
      test(testCase.name, () => {
        expect(canManageVenue(testCase.admin, testCase.resource)).toBe(testCase.expected);
      });
    }
  });

  describe("canManageBoard", () => {
    const cases: Array<BooleanCase & { resource: BoardResourceContext }> = [
      {
        name: "org_owner can manage boards in any venue",
        admin: context(orgOwnerMembership),
        resource: boardA2,
        expected: true,
      },
      {
        name: "venue_manager can manage boards in assigned venue",
        admin: context(venueManagerMembership),
        resource: boardA1,
        expected: true,
      },
      {
        name: "venue_staff cannot manage boards",
        admin: context(venueStaffMembership),
        resource: boardA1,
        expected: false,
      },
      {
        name: "venue_manager cannot manage boards in unassigned venue",
        admin: context(venueManagerMembership),
        resource: boardA2,
        expected: false,
      },
    ];

    for (const testCase of cases) {
      test(testCase.name, () => {
        expect(canManageBoard(testCase.admin, testCase.resource)).toBe(testCase.expected);
      });
    }
  });

  describe("canOperateBoard", () => {
    const cases: Array<BooleanCase & { resource: BoardResourceContext }> = [
      {
        name: "org_owner can operate boards in any venue",
        admin: context(orgOwnerMembership),
        resource: boardA2,
        expected: true,
      },
      {
        name: "venue_manager can operate boards in assigned venue",
        admin: context(venueManagerMembership),
        resource: boardA1,
        expected: true,
      },
      {
        name: "venue_staff can operate boards in assigned venue",
        admin: context(venueStaffMembership),
        resource: boardA1,
        expected: true,
      },
      {
        name: "venue_staff cannot operate boards in unassigned venue",
        admin: context(venueStaffMembership),
        resource: boardA2,
        expected: false,
      },
      {
        name: "venue_staff cannot operate boards in different organization",
        admin: context(venueStaffMembership),
        resource: {
          organizationId: ORG_B,
          venueId: "venue-b1",
          boardId: "board-b1",
        },
        expected: false,
      },
    ];

    for (const testCase of cases) {
      test(testCase.name, () => {
        expect(canOperateBoard(testCase.admin, testCase.resource)).toBe(testCase.expected);
      });
    }
  });

  describe("assert helpers", () => {
    test("assertCanReadOrganization passes for allowed access", () => {
      assertCanReadOrganization(context(venueStaffMembership), ORG_A);
    });

    test("assertCanManageOrganization throws forbidden for venue staff", () => {
      expect(() => assertCanManageOrganization(context(venueStaffMembership), ORG_A)).toThrow(
        forbiddenError(),
      );
    });

    test("assertCanReadVenue throws forbidden for wrong venue", () => {
      expect(() => assertCanReadVenue(context(venueStaffMembership), venueA2)).toThrow(
        forbiddenError(),
      );
    });

    test("assertCanManageVenue throws forbidden for venue staff", () => {
      expect(() => assertCanManageVenue(context(venueStaffMembership), venueA1)).toThrow(
        forbiddenError(),
      );
    });

    test("assertCanManageBoard throws forbidden for venue staff", () => {
      expect(() => assertCanManageBoard(context(venueStaffMembership), boardA1)).toThrow(
        forbiddenError(),
      );
    });

    test("assertCanOperateBoard passes for venue staff on assigned board", () => {
      assertCanOperateBoard(context(venueStaffMembership), boardA1);
    });

    test("assertCanOperateBoard throws forbidden for venue staff on unassigned board", () => {
      expect(() => assertCanOperateBoard(context(venueStaffMembership), boardA2)).toThrow(
        forbiddenError(),
      );
    });
  });

  // Super-admin bypasses tenant resource scope only — not auth, validation,
  // CSRF, rate limiting, delete guards, or audit requirements.
  describe("super-admin scope bypass", () => {
    const superAdmin: AdminRbacContext = { memberships: [], isSuperAdmin: true };
    const regularAdmin: AdminRbacContext = { memberships: [], isSuperAdmin: false };

    test("super-admin with zero memberships can read any org", () => {
      expect(canReadOrganization(superAdmin, ORG_A)).toBe(true);
      expect(canReadOrganization(superAdmin, ORG_B)).toBe(true);
    });

    test("super-admin with zero memberships can manage any org", () => {
      expect(canManageOrganization(superAdmin, ORG_A)).toBe(true);
      expect(canManageOrganization(superAdmin, ORG_B)).toBe(true);
    });

    test("super-admin with zero memberships can read any venue", () => {
      expect(canReadVenue(superAdmin, venueA1)).toBe(true);
      expect(canReadVenue(superAdmin, venueB1)).toBe(true);
    });

    test("super-admin with zero memberships can manage any venue", () => {
      expect(canManageVenue(superAdmin, venueA1)).toBe(true);
      expect(canManageVenue(superAdmin, venueB1)).toBe(true);
    });

    test("super-admin with zero memberships can manage any board", () => {
      expect(canManageBoard(superAdmin, boardA1)).toBe(true);
      expect(canManageBoard(superAdmin, boardA2)).toBe(true);
    });

    test("super-admin with zero memberships can operate any board", () => {
      expect(canOperateBoard(superAdmin, boardA1)).toBe(true);
      expect(canOperateBoard(superAdmin, boardA2)).toBe(true);
    });

    test("canManagePlatform returns true for super-admin", () => {
      expect(canManagePlatform(superAdmin)).toBe(true);
    });

    test("canManagePlatform returns false for non-super-admin", () => {
      expect(canManagePlatform(regularAdmin)).toBe(false);
      expect(canManagePlatform(context(orgOwnerMembership))).toBe(false);
    });

    test("assertSuperAdmin does not throw for super-admin", () => {
      assertSuperAdmin(superAdmin);
    });

    test("assertSuperAdmin throws forbidden for non-super-admin", () => {
      expect(() => assertSuperAdmin(regularAdmin)).toThrow(forbiddenError());
    });

    test("assertSuperAdmin throws forbidden for org_owner without isSuperAdmin", () => {
      expect(() => assertSuperAdmin(context(orgOwnerMembership))).toThrow(forbiddenError());
    });

    test("non-super-admin with zero memberships cannot read any org", () => {
      expect(canReadOrganization(regularAdmin, ORG_A)).toBe(false);
    });

    test("non-super-admin with zero memberships cannot manage any org", () => {
      expect(canManageOrganization(regularAdmin, ORG_A)).toBe(false);
    });
  });

  // Membership management uses canManagePlatform (super-admin) and
  // canManageOrganization (org-owner) as its two RBAC gates. These tests
  // document the expected guard behavior for that surface.
  describe("membership management gates", () => {
    const superAdmin: AdminRbacContext = { memberships: [], isSuperAdmin: true };

    test("super-admin passes canManagePlatform gate", () => {
      expect(canManagePlatform(superAdmin)).toBe(true);
    });

    test("org_owner fails canManagePlatform gate (cannot grant platform-level access)", () => {
      expect(canManagePlatform(context(orgOwnerMembership))).toBe(false);
    });

    test("org_owner passes canManageOrganization for own org", () => {
      expect(canManageOrganization(context(orgOwnerMembership), ORG_A)).toBe(true);
    });

    test("org_owner fails canManageOrganization for a different org", () => {
      expect(canManageOrganization(context(orgOwnerMembership), ORG_B)).toBe(false);
    });

    test("venue_manager fails canManageOrganization (cannot manage memberships)", () => {
      expect(canManageOrganization(context(venueManagerMembership), ORG_A)).toBe(false);
    });

    test("venue_staff fails canManageOrganization (cannot manage memberships)", () => {
      expect(canManageOrganization(context(venueStaffMembership), ORG_A)).toBe(false);
    });

    test("super-admin with no memberships can manage any org", () => {
      expect(canManageOrganization(superAdmin, ORG_A)).toBe(true);
      expect(canManageOrganization(superAdmin, ORG_B)).toBe(true);
    });
  });

  describe("operator hierarchy isolation", () => {
    test("org_owner holding memberships in all orgs still cannot manage platform", () => {
      const multiOrgOwner = context(
        membership(ORG_A, null, "org_owner"),
        membership(ORG_B, null, "org_owner"),
      );
      expect(canManagePlatform(multiOrgOwner)).toBe(false);
    });

    test("isSuperAdmin: false with full org coverage cannot pass canManagePlatform", () => {
      const admin: AdminRbacContext = {
        memberships: [
          { organizationId: ORG_A, venueId: null, role: "org_owner" },
          { organizationId: ORG_B, venueId: null, role: "org_owner" },
        ],
        isSuperAdmin: false,
      };
      expect(canManagePlatform(admin)).toBe(false);
    });

    test("org_owner scope is strictly limited to their own org — no lateral access", () => {
      const orgAOwner = context(membership(ORG_A, null, "org_owner"));
      expect(canManageOrganization(orgAOwner, ORG_A)).toBe(true);
      expect(canManageOrganization(orgAOwner, ORG_B)).toBe(false);
    });
  });

  describe("getOwnedOrganizationIds", () => {
    test("returns org IDs where the context has org_owner role", () => {
      const result = getOwnedOrganizationIds(context(orgOwnerMembership));
      expect(result).toEqual([ORG_A]);
    });

    test("excludes orgs where the context only has venue-level roles", () => {
      const result = getOwnedOrganizationIds(context(venueManagerMembership));
      expect(result).toEqual([]);
    });

    test("excludes orgs where the context has venue_staff role", () => {
      const result = getOwnedOrganizationIds(context(venueStaffMembership));
      expect(result).toEqual([]);
    });

    test("returns empty array for super-admin with no memberships", () => {
      const superAdmin: AdminRbacContext = { memberships: [], isSuperAdmin: true };
      expect(getOwnedOrganizationIds(superAdmin)).toEqual([]);
    });

    test("returns empty array when context has no memberships", () => {
      const empty: AdminRbacContext = { memberships: [] };
      expect(getOwnedOrganizationIds(empty)).toEqual([]);
    });

    test("returns multiple org IDs when context owns multiple orgs", () => {
      const multiOwner = context(orgOwnerMembership, membership(ORG_B, null, "org_owner"));
      const result = getOwnedOrganizationIds(multiOwner);
      expect(result.includes(ORG_A)).toBe(true);
      expect(result.includes(ORG_B)).toBe(true);
      expect(result.length).toBe(2);
    });

    test("does not include org where context has venue_manager at org level (venueId non-null)", () => {
      // org_owner requires venueId === null
      const result = getOwnedOrganizationIds(context(venueManagerMembership));
      expect(result).toEqual([]);
    });
  });

  describe("canCreateAdminWithMembership (creation chain of command)", () => {
    const superAdmin: AdminRbacContext = { memberships: [], isSuperAdmin: true };

    test("super-admin can grant any role anywhere", () => {
      expect(
        canCreateAdminWithMembership(superAdmin, {
          organizationId: ORG_B,
          venueId: null,
          role: "org_owner",
        }),
      ).toBe(true);
      expect(
        canCreateAdminWithMembership(superAdmin, {
          organizationId: ORG_B,
          venueId: VENUE_A1,
          role: "venue_staff",
        }),
      ).toBe(true);
    });

    test("org-owner can grant any role within their org", () => {
      const ctx = context(orgOwnerMembership);
      expect(
        canCreateAdminWithMembership(ctx, {
          organizationId: ORG_A,
          venueId: null,
          role: "org_owner",
        }),
      ).toBe(true);
      expect(
        canCreateAdminWithMembership(ctx, {
          organizationId: ORG_A,
          venueId: VENUE_A1,
          role: "venue_manager",
        }),
      ).toBe(true);
      expect(
        canCreateAdminWithMembership(ctx, {
          organizationId: ORG_A,
          venueId: VENUE_A1,
          role: "venue_staff",
        }),
      ).toBe(true);
    });

    test("org-owner cannot grant in a different org", () => {
      const ctx = context(orgOwnerMembership);
      expect(
        canCreateAdminWithMembership(ctx, {
          organizationId: ORG_B,
          venueId: null,
          role: "org_owner",
        }),
      ).toBe(false);
    });

    test("venue-manager can grant manager/staff in their own venue, not org_owner", () => {
      const ctx = context(venueManagerMembership);
      expect(
        canCreateAdminWithMembership(ctx, {
          organizationId: ORG_A,
          venueId: VENUE_A1,
          role: "venue_manager",
        }),
      ).toBe(true);
      expect(
        canCreateAdminWithMembership(ctx, {
          organizationId: ORG_A,
          venueId: VENUE_A1,
          role: "venue_staff",
        }),
      ).toBe(true);
      expect(
        canCreateAdminWithMembership(ctx, {
          organizationId: ORG_A,
          venueId: null,
          role: "org_owner",
        }),
      ).toBe(false);
    });

    test("venue-manager cannot grant in a venue they don't manage", () => {
      const ctx = context(venueManagerMembership);
      expect(
        canCreateAdminWithMembership(ctx, {
          organizationId: ORG_A,
          venueId: VENUE_A2,
          role: "venue_staff",
        }),
      ).toBe(false);
    });

    test("venue-staff cannot grant anything", () => {
      const ctx = context(venueStaffMembership);
      for (const role of ["org_owner", "venue_manager", "venue_staff"] as const) {
        expect(
          canCreateAdminWithMembership(ctx, {
            organizationId: ORG_A,
            venueId: role === "org_owner" ? null : VENUE_A1,
            role,
          }),
        ).toBe(false);
      }
    });

    test("grantableCreateRoles reflects the chain of command", () => {
      // Org-owner asked for org-level scope → only org_owner is grantable there.
      expect(
        grantableCreateRoles(context(orgOwnerMembership), { organizationId: ORG_A, venueId: null }),
      ).toEqual(["org_owner"]);
      // Org-owner at a venue scope → venue roles.
      expect(
        grantableCreateRoles(context(orgOwnerMembership), {
          organizationId: ORG_A,
          venueId: VENUE_A1,
        }),
      ).toEqual(["venue_manager", "venue_staff"]);
      // Venue-manager at their venue → manager/staff only.
      expect(
        grantableCreateRoles(context(venueManagerMembership), {
          organizationId: ORG_A,
          venueId: VENUE_A1,
        }),
      ).toEqual(["venue_manager", "venue_staff"]);
      // Venue-staff → nothing.
      expect(
        grantableCreateRoles(context(venueStaffMembership), {
          organizationId: ORG_A,
          venueId: VENUE_A1,
        }),
      ).toEqual([]);
    });
  });
});
