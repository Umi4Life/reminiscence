export type ValidationResult<TValue, TCode extends string> =
  | ValidationSuccess<TValue>
  | ValidationFailure<TCode>;

export interface ValidationSuccess<TValue> {
  ok: true;
  value: TValue;
}

export interface ValidationFailure<TCode extends string> {
  ok: false;
  code: TCode;
  message: string;
}

export type DisplayNameValidationCode = "display_name_required" | "display_name_too_long";

export type DisplayNameValidationResult = ValidationResult<string, DisplayNameValidationCode>;

export type SlugValidationCode = "slug_required" | "slug_invalid";

export type SlugValidationResult = ValidationResult<string, SlugValidationCode>;

export type TimezoneValidationCode = "timezone_required" | "timezone_invalid";

export type TimezoneValidationResult = ValidationResult<string, TimezoneValidationCode>;
