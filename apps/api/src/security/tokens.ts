import { createHmac, randomBytes } from "node:crypto";

export const DEFAULT_OPAQUE_TOKEN_BYTES = 32;
export const URL_SAFE_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

export function generateOpaqueToken(byteLength = DEFAULT_OPAQUE_TOKEN_BYTES): string {
  if (!Number.isSafeInteger(byteLength) || byteLength < 16) {
    throw new Error("Opaque tokens must use at least 16 random bytes.");
  }

  return randomBytes(byteLength).toString("base64url");
}

export function hashOpaqueToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("base64url");
}

const TOKEN_PREVIEW_PREFIX_LENGTH = 8;

/**
 * Builds a short, non-sensitive preview for staff disambiguation. Prefix-only
 * by design: exposing the trailing characters as well would reveal both ends of
 * the raw token for no operational benefit. Never reconstructable into the
 * token (256-bit), but prefix-only is strictly safer than prefix+suffix.
 */
export function createTokenPreview(token: string): string {
  return `${token.slice(0, TOKEN_PREVIEW_PREFIX_LENGTH)}…`;
}
