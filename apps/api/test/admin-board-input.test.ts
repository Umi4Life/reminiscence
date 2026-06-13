import { describe, expect, test } from "bun:test";

import {
  parseCreateBoardBody,
  parsePatchBoardBody,
  patchChangesDisplayVersion,
} from "../src/admin/board-input";
import { VENUE_A1 } from "./admin-fixtures";

describe("parseCreateBoardBody", () => {
  test("parses required fields and applies defaults", () => {
    expect(
      parseCreateBoardBody({
        venueId: VENUE_A1,
        slug: "new-board",
        publicSlug: "new-board-public",
        name: " New Board ",
      }),
    ).toEqual({
      venueId: VENUE_A1,
      slug: "new-board",
      publicSlug: "new-board-public",
      name: "New Board",
      description: null,
      status: "closed",
      publicViewPolicy: "open",
      publicAddPolicy: "access_code_required",
      publicRemovePolicy: "access_code_required",
      qrRotationPolicy: "manual",
      qrRotationIntervalMinutes: null,
    });
  });

  test("accepts explicit public policy fields and nullable description", () => {
    expect(
      parseCreateBoardBody({
        venueId: VENUE_A1,
        slug: "board-a",
        publicSlug: "board-a-public",
        name: "Board A",
        description: "  ",
        status: "closed",
        publicViewPolicy: "access_code_required",
        publicAddPolicy: "staff_only",
        publicRemovePolicy: "disabled",
        qrRotationPolicy: "manual",
        qrRotationIntervalMinutes: null,
      }),
    ).toEqual({
      venueId: VENUE_A1,
      slug: "board-a",
      publicSlug: "board-a-public",
      name: "Board A",
      description: null,
      status: "closed",
      publicViewPolicy: "access_code_required",
      publicAddPolicy: "staff_only",
      publicRemovePolicy: "disabled",
      qrRotationPolicy: "manual",
      qrRotationIntervalMinutes: null,
    });
  });

  test("rejects open status and scheduled QR settings on create", () => {
    const baseBody = {
      venueId: VENUE_A1,
      slug: "board-a",
      publicSlug: "board-a-public",
      name: "Board A",
    };

    expect(() => parseCreateBoardBody({ ...baseBody, status: "open" })).toThrow(
      "status must be closed when creating a board.",
    );
    expect(() => parseCreateBoardBody({ ...baseBody, qrRotationPolicy: "scheduled" })).toThrow(
      "qrRotationPolicy must be manual when creating a board.",
    );
    expect(() => parseCreateBoardBody({ ...baseBody, qrRotationIntervalMinutes: 30 })).toThrow(
      "qrRotationIntervalMinutes must be null when creating a board.",
    );
  });

  test("rejects invalid venue id", () => {
    expect(() =>
      parseCreateBoardBody({
        venueId: "not-a-uuid",
        slug: "board-a",
        publicSlug: "board-a-public",
        name: "Board A",
      }),
    ).toThrow("venueId must be a valid UUID.");
  });

  test("rejects invalid slug characters", () => {
    expect(() =>
      parseCreateBoardBody({
        venueId: VENUE_A1,
        slug: "Bad Slug",
        publicSlug: "board-a-public",
        name: "Board A",
      }),
    ).toThrow("Slug must contain only lowercase URL-safe characters.");
  });

  test("rejects blank name", () => {
    expect(() =>
      parseCreateBoardBody({
        venueId: VENUE_A1,
        slug: "board-a",
        publicSlug: "board-a-public",
        name: "   ",
      }),
    ).toThrow("Name is required.");
  });
});

describe("parsePatchBoardBody", () => {
  test("accepts whitelisted fields only", () => {
    expect(
      parsePatchBoardBody({
        name: "Updated Board",
        description: "Queue for tonight",
      }),
    ).toEqual({
      name: "Updated Board",
      description: "Queue for tonight",
    });
  });

  test("rejects empty patch", () => {
    expect(() => parsePatchBoardBody({})).toThrow("At least one board field must be provided.");
  });

  test("rejects forbidden fields", () => {
    expect(() => parsePatchBoardBody({ venueId: VENUE_A1 })).toThrow("venueId cannot be updated.");
    expect(() => parsePatchBoardBody({ displayVersion: 99 })).toThrow(
      "displayVersion cannot be updated.",
    );
    expect(() => parsePatchBoardBody({ nextSortOrder: 5 })).toThrow(
      "nextSortOrder cannot be updated.",
    );
    expect(() => parsePatchBoardBody({ status: "open" })).toThrow("status cannot be updated.");
    expect(() => parsePatchBoardBody({ qrRotationPolicy: "scheduled" })).toThrow(
      "qrRotationPolicy cannot be updated.",
    );
    expect(() => parsePatchBoardBody({ qrRotationIntervalMinutes: 30 })).toThrow(
      "qrRotationIntervalMinutes cannot be updated.",
    );
  });

  test("rejects unknown fields", () => {
    expect(() => parsePatchBoardBody({ mystery: "value" })).toThrow(
      "Field mystery is not allowed in board updates.",
    );
  });
});

describe("patchChangesDisplayVersion", () => {
  test("returns true for display-visible metadata and policy fields", () => {
    expect(patchChangesDisplayVersion({ name: "New Name" })).toBe(true);
    expect(patchChangesDisplayVersion({ publicSlug: "new-public-slug" })).toBe(true);
    expect(patchChangesDisplayVersion({ publicViewPolicy: "access_code_required" })).toBe(true);
  });

  test("returns false for admin-only or non-display fields", () => {
    expect(patchChangesDisplayVersion({ slug: "admin-slug" })).toBe(false);
    expect(patchChangesDisplayVersion({ description: "Back office note" })).toBe(false);
    expect(patchChangesDisplayVersion({ publicAddPolicy: "staff_only" })).toBe(false);
    expect(patchChangesDisplayVersion({ publicRemovePolicy: "disabled" })).toBe(false);
  });
});
