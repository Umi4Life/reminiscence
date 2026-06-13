import { describe, expect, test } from "bun:test";

import { validateDisplayName, validateSlug } from "../src";

describe("validateDisplayName", () => {
  test("trims leading and trailing whitespace", () => {
    expect(validateDisplayName("  Aki  ")).toEqual({ ok: true, value: "Aki" });
  });

  test("collapses repeated internal whitespace", () => {
    expect(validateDisplayName("Red   jacket")).toEqual({ ok: true, value: "Red jacket" });
  });

  test("rejects whitespace-only names", () => {
    expect(validateDisplayName("   \t\n  ")).toEqual({
      ok: false,
      code: "display_name_required",
      message: "Display name is required.",
    });
  });

  test("accepts display names exactly 40 characters after normalization", () => {
    expect(validateDisplayName("a".repeat(40))).toEqual({ ok: true, value: "a".repeat(40) });
  });

  test("rejects display names longer than 40 characters after normalization", () => {
    expect(validateDisplayName(`  ${"a".repeat(41)}  `)).toEqual({
      ok: false,
      code: "display_name_too_long",
      message: "Display name must be 40 characters or fewer.",
    });
  });
});

describe("validateSlug", () => {
  test("accepts lowercase URL-safe slugs", () => {
    expect(validateSlug("red-jacket-2")).toEqual({ ok: true, value: "red-jacket-2" });
    expect(validateSlug("red_jacket.2~demo")).toEqual({
      ok: true,
      value: "red_jacket.2~demo",
    });
  });

  test("rejects uppercase slugs", () => {
    expect(validateSlug("Red-jacket")).toEqual({
      ok: false,
      code: "slug_invalid",
      message: "Slug must contain only lowercase URL-safe characters.",
    });
  });

  test("rejects characters that are not URL-safe slug characters", () => {
    expect(validateSlug("red jacket")).toEqual({
      ok: false,
      code: "slug_invalid",
      message: "Slug must contain only lowercase URL-safe characters.",
    });
    expect(validateSlug("red/jacket")).toEqual({
      ok: false,
      code: "slug_invalid",
      message: "Slug must contain only lowercase URL-safe characters.",
    });
  });

  test("rejects blank slugs", () => {
    expect(validateSlug("")).toEqual({
      ok: false,
      code: "slug_required",
      message: "Slug is required.",
    });
  });
});
