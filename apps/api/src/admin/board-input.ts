import type { Board } from "@queue-reminiscence/db";

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

export function patchChangesDisplayVersion(patch: PatchBoardInput): boolean {
  return Object.keys(patch).some((field) => displayVisiblePatchFields.has(field));
}
