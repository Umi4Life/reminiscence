import { describe, expect, test } from "bun:test";

import { patchChangesDisplayVersion } from "../src/admin/board-input";

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
