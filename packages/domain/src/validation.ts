import type {
  DisplayNameValidationResult,
  SlugValidationResult,
  TimezoneValidationResult,
} from "./types";

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

function isSupportedTimezone(tz: string): boolean {
  if (typeof Intl.supportedValuesOf === "function") {
    try {
      return Intl.supportedValuesOf("timeZone").includes(tz);
    } catch {
      // fall through to constructor fallback
    }
  }
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function validateTimezone(input: string): TimezoneValidationResult {
  const value = input.trim();

  if (value.length === 0) {
    return {
      ok: false,
      code: "timezone_required",
      message: "Timezone is required.",
    };
  }

  if (!isSupportedTimezone(value)) {
    return {
      ok: false,
      code: "timezone_invalid",
      message: "Timezone must be a valid IANA timezone name.",
    };
  }

  return { ok: true, value };
}
