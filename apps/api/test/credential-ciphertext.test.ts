import { describe, expect, test } from "bun:test";

import { decryptAccessCode, encryptAccessCode } from "../src/access/credential-ciphertext";

describe("credential ciphertext", () => {
  test("round-trip encrypt and decrypt", () => {
    const secret = "test-secret";
    const plaintext = "my-access-code-abc123";
    const ciphertext = encryptAccessCode(plaintext, secret);
    const result = decryptAccessCode(ciphertext, secret);
    expect(result === plaintext).toBe(true);
  });

  test("different secrets produce different ciphertexts", () => {
    const plaintext = "access-code-xyz";
    const ct1 = encryptAccessCode(plaintext, "secret-a");
    const ct2 = encryptAccessCode(plaintext, "secret-b");
    expect(ct1 === ct2).toBe(false);
  });

  test("wrong secret throws on decrypt", () => {
    const plaintext = "some-access-code";
    const ciphertext = encryptAccessCode(plaintext, "correct-secret");
    expect(() => decryptAccessCode(ciphertext, "wrong-secret")).toThrow();
  });

  test("tampered blob throws on decrypt", () => {
    const plaintext = "another-access-code";
    const ciphertext = encryptAccessCode(plaintext, "my-secret");
    // Flip a byte in the middle of the ciphertext
    const buf = Buffer.from(ciphertext, "base64url");
    buf[20] = buf[20]! ^ 0xff;
    const tampered = buf.toString("base64url");
    expect(() => decryptAccessCode(tampered, "my-secret")).toThrow();
  });
});
