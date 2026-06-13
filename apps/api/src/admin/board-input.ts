import type { Board } from "@queue-reminiscence/db";
import { validateSlug } from "@queue-reminiscence/domain";

import { validationError } from "../http/errors";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const publicViewPolicies = ["open", "access_code_required"] as const;
const publicMutationPolicies = ["access_code_required", "staff_only", "disabled"] as const;
const qrRotationPolicies = ["manual", "scheduled"] as const;

const patchForbiddenFields = [
  "venueId",
  "status",
  "qrRotationPolicy",
  "qrRotationIntervalMinutes",
  "displayVersion",
  "nextSortOrder",
] as const;
const patchAllowedFields = [
  "slug",
  "publicSlug",
  "name",
  "description",
  "publicViewPolicy",
  "publicAddPolicy",
  "publicRemovePolicy",
] as const;

const displayVisiblePatchFields = new Set<string>(["name", "publicSlug", "publicViewPolicy"]);

export type BoardStatus = Board["status"];
export type PublicViewPolicy = Board["publicViewPolicy"];
export type PublicMutationPolicy = Board["publicAddPolicy"];
export type QrRotationPolicy = Board["qrRotationPolicy"];

export interface CreateBoardInput {
  venueId: string;
  slug: string;
  publicSlug: string;
  name: string;
  description: string | null;
  status: BoardStatus;
  publicViewPolicy: PublicViewPolicy;
  publicAddPolicy: PublicMutationPolicy;
  publicRemovePolicy: PublicMutationPolicy;
  qrRotationPolicy: QrRotationPolicy;
  qrRotationIntervalMinutes: number | null;
}

export interface PatchBoardInput {
  slug?: string;
  publicSlug?: string;
  name?: string;
  description?: string | null;
  publicViewPolicy?: PublicViewPolicy;
  publicAddPolicy?: PublicMutationPolicy;
  publicRemovePolicy?: PublicMutationPolicy;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseUuid(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !uuidPattern.test(value.trim())) {
    throw validationError(`${fieldName} must be a valid UUID.`);
  }

  return value.trim();
}

function parseRequiredSlug(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw validationError(`${fieldName} is required.`);
  }

  const trimmed = value.trim();
  const result = validateSlug(trimmed);

  if (!result.ok) {
    throw validationError(result.message);
  }

  return result.value;
}

function parseRequiredName(value: unknown): string {
  if (typeof value !== "string") {
    throw validationError("Name is required.");
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw validationError("Name is required.");
  }

  return trimmed;
}

function parseOptionalDescription(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw validationError("Description must be a string or null.");
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldName: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw validationError(`${fieldName} is invalid.`);
  }

  return value as T;
}

function parseQrRotationIntervalMinutes(
  value: unknown,
  qrRotationPolicy: QrRotationPolicy,
): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw validationError("qrRotationIntervalMinutes must be a positive integer or null.");
  }

  if (qrRotationPolicy === "manual" && value !== null) {
    throw validationError(
      "qrRotationIntervalMinutes must be null when qrRotationPolicy is manual.",
    );
  }

  return value;
}

function assertNoForbiddenPatchFields(body: Record<string, unknown>): void {
  for (const field of patchForbiddenFields) {
    if (field in body) {
      throw validationError(`${field} cannot be updated.`);
    }
  }
}

function assertOnlyAllowedPatchFields(body: Record<string, unknown>): void {
  for (const field of Object.keys(body)) {
    if (!(patchAllowedFields as readonly string[]).includes(field)) {
      throw validationError(`Field ${field} is not allowed in board updates.`);
    }
  }
}

export function parseCreateBoardBody(body: unknown): CreateBoardInput {
  if (!isRecord(body)) {
    throw validationError("Request body must be a JSON object.");
  }

  const venueId = parseUuid(body.venueId, "venueId");
  const slug = parseRequiredSlug(body.slug, "Slug");
  const publicSlug = parseRequiredSlug(body.publicSlug, "Public slug");
  const name = parseRequiredName(body.name);
  const description = parseOptionalDescription(body.description) ?? null;
  if (body.status !== undefined && body.status !== "closed") {
    throw validationError("status must be closed when creating a board.");
  }

  if (body.qrRotationPolicy !== undefined && body.qrRotationPolicy !== "manual") {
    throw validationError("qrRotationPolicy must be manual when creating a board.");
  }

  if (body.qrRotationIntervalMinutes !== undefined && body.qrRotationIntervalMinutes !== null) {
    throw validationError("qrRotationIntervalMinutes must be null when creating a board.");
  }

  const status = "closed";
  const publicViewPolicy =
    body.publicViewPolicy === undefined
      ? "open"
      : parseEnumValue(body.publicViewPolicy, publicViewPolicies, "publicViewPolicy");
  const publicAddPolicy =
    body.publicAddPolicy === undefined
      ? "access_code_required"
      : parseEnumValue(body.publicAddPolicy, publicMutationPolicies, "publicAddPolicy");
  const publicRemovePolicy =
    body.publicRemovePolicy === undefined
      ? "access_code_required"
      : parseEnumValue(body.publicRemovePolicy, publicMutationPolicies, "publicRemovePolicy");
  const qrRotationPolicy =
    body.qrRotationPolicy === undefined
      ? "manual"
      : parseEnumValue(body.qrRotationPolicy, qrRotationPolicies, "qrRotationPolicy");
  const qrRotationIntervalMinutes =
    parseQrRotationIntervalMinutes(body.qrRotationIntervalMinutes, qrRotationPolicy) ?? null;

  return {
    venueId,
    slug,
    publicSlug,
    name,
    description,
    status,
    publicViewPolicy,
    publicAddPolicy,
    publicRemovePolicy,
    qrRotationPolicy,
    qrRotationIntervalMinutes,
  };
}

export function parsePatchBoardBody(body: unknown): PatchBoardInput {
  if (!isRecord(body)) {
    throw validationError("Request body must be a JSON object.");
  }

  assertNoForbiddenPatchFields(body);
  assertOnlyAllowedPatchFields(body);

  if (Object.keys(body).length === 0) {
    throw validationError("At least one board field must be provided.");
  }

  const patch: PatchBoardInput = {};

  if ("slug" in body) {
    patch.slug = parseRequiredSlug(body.slug, "Slug");
  }

  if ("publicSlug" in body) {
    patch.publicSlug = parseRequiredSlug(body.publicSlug, "Public slug");
  }

  if ("name" in body) {
    patch.name = parseRequiredName(body.name);
  }

  if ("description" in body) {
    patch.description = parseOptionalDescription(body.description) ?? null;
  }

  if ("publicViewPolicy" in body) {
    patch.publicViewPolicy = parseEnumValue(
      body.publicViewPolicy,
      publicViewPolicies,
      "publicViewPolicy",
    );
  }

  if ("publicAddPolicy" in body) {
    patch.publicAddPolicy = parseEnumValue(
      body.publicAddPolicy,
      publicMutationPolicies,
      "publicAddPolicy",
    );
  }

  if ("publicRemovePolicy" in body) {
    patch.publicRemovePolicy = parseEnumValue(
      body.publicRemovePolicy,
      publicMutationPolicies,
      "publicRemovePolicy",
    );
  }

  return patch;
}

export function patchChangesDisplayVersion(patch: PatchBoardInput): boolean {
  return Object.keys(patch).some((field) => displayVisiblePatchFields.has(field));
}
