import { describe, expect, test } from "bun:test";

import {
  createTokenPreview,
  generateOpaqueToken,
  hashOpaqueToken,
  URL_SAFE_TOKEN_PATTERN,
} from "../src/security/tokens";

describe("opaque token helpers", () => {
  test("generateOpaqueToken returns URL-safe high-entropy tokens", () => {
    const token = generateOpaqueToken();

    expect(token.length >= 43).toBe(true);
    expect(URL_SAFE_TOKEN_PATTERN.test(token)).toBe(true);
  });

  test("generated tokens are unique across repeated generation", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateOpaqueToken()));

    expect(tokens.size).toBe(20);
  });

  test("generateOpaqueToken rejects undersized tokens", () => {
    expect(() => generateOpaqueToken(15)).toThrow("at least 16 random bytes");
  });

  test("hashOpaqueToken is deterministic for the same token and secret", () => {
    const token = "fixed-access-code";
    const secret = "test-token-secret";

    const first = hashOpaqueToken(token, secret);
    const second = hashOpaqueToken(token, secret);

    expect(first).toBe(second);
    expect(URL_SAFE_TOKEN_PATTERN.test(first)).toBe(true);
  });

  test("hashOpaqueToken changes when token or secret changes", () => {
    const token = "fixed-access-code";
    const secret = "test-token-secret";
    const baseline = hashOpaqueToken(token, secret);

    expect(hashOpaqueToken("other-access-code", secret) === baseline).toBe(false);
    expect(hashOpaqueToken(token, "other-secret") === baseline).toBe(false);
  });

  test("createTokenPreview exposes only a short prefix of the token", () => {
    const token = "abcdefghijklmnopqrstuvwxyz0123456789";
    const preview = createTokenPreview(token);

    expect(preview).toBe("abcdefgh…");
    expect(preview.length <= 32).toBe(true);
    expect(preview === token).toBe(false);
    // The trailing characters of the token must never appear in the preview.
    expect(preview.includes("456789")).toBe(false);
  });
});
