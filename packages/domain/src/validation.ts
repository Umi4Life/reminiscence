import type { DisplayNameValidationResult, SlugValidationResult } from "./types";

const maxDisplayNameLength = 40;
const slugPattern = /^[a-z0-9._~-]+$/;

export function validateDisplayName(input: string): DisplayNameValidationResult {
  const value = input.trim().replace(/\s+/g, " ");

  if (value.length === 0) {
    return {
      ok: false,
      code: "display_name_required",
      message: "Display name is required.",
    };
  }

  if (value.length > maxDisplayNameLength) {
    return {
      ok: false,
      code: "display_name_too_long",
      message: "Display name must be 40 characters or fewer.",
    };
  }

  return { ok: true, value };
}

export function validateSlug(input: string): SlugValidationResult {
  if (input.length === 0) {
    return {
      ok: false,
      code: "slug_required",
      message: "Slug is required.",
    };
  }

  if (!slugPattern.test(input)) {
    return {
      ok: false,
      code: "slug_invalid",
      message: "Slug must contain only lowercase URL-safe characters.",
    };
  }

  return { ok: true, value: input };
}
