import { describe, expect, test } from "bun:test";

import { buildMutationRequestMeta } from "../src/public/audit-metadata";
import { testAppConfig } from "./test-config";

const HEX_SHA256 = /^[0-9a-f]{64}$/;

function createRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/public/boards/demo/entries", {
    headers,
  });
}

describe("buildMutationRequestMeta", () => {
  test("hashes IP from X-Forwarded-For when trustProxy=true", () => {
    const request = createRequest({ "x-forwarded-for": "1.2.3.4" });
    const meta = buildMutationRequestMeta(request, { ...testAppConfig, trustProxy: true });

    expect(typeof meta.ipHash === "string").toBe(true);
    expect(HEX_SHA256.test(meta.ipHash as string)).toBe(true);
  });

  test("returns null ipHash when trustProxy=false even if X-Forwarded-For is present", () => {
    const request = createRequest({ "x-forwarded-for": "1.2.3.4" });
    const meta = buildMutationRequestMeta(request, { ...testAppConfig, trustProxy: false });

    expect(meta.ipHash).toBe(null);
  });

  test("uses the rightmost IP from X-Forwarded-For when multiple are present", () => {
    // Behind a single trusted proxy hop, the rightmost entry is the real client
    // IP the proxy observed; entries to the left are client-supplied/spoofable.
    const rightmost = createRequest({ "x-forwarded-for": "5.6.7.8" });
    const multiple = createRequest({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });

    const rightmostMeta = buildMutationRequestMeta(rightmost, testAppConfig);
    const multipleMeta = buildMutationRequestMeta(multiple, testAppConfig);

    expect(multipleMeta.ipHash).toBe(rightmostMeta.ipHash);
  });

  test("hashes user-agent when present", () => {
    const request = createRequest({ "user-agent": "QueueReminiscenceTest/1.0" });
    const meta = buildMutationRequestMeta(request, testAppConfig);

    expect(typeof meta.userAgentHash === "string").toBe(true);
    expect(HEX_SHA256.test(meta.userAgentHash as string)).toBe(true);
  });

  test("returns null userAgentHash when user-agent header is missing", () => {
    const request = createRequest();
    const meta = buildMutationRequestMeta(request, testAppConfig);

    expect(meta.userAgentHash).toBe(null);
  });

  test("output hashes are hex strings", () => {
    const request = createRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "QueueReminiscenceTest/1.0",
    });
    const meta = buildMutationRequestMeta(request, testAppConfig);

    expect(HEX_SHA256.test(meta.ipHash as string)).toBe(true);
    expect(HEX_SHA256.test(meta.userAgentHash as string)).toBe(true);
  });

  test("same input produces the same hash", () => {
    const headers = {
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "QueueReminiscenceTest/1.0",
    };
    const first = buildMutationRequestMeta(createRequest(headers), testAppConfig);
    const second = buildMutationRequestMeta(createRequest(headers), testAppConfig);

    expect(first).toEqual(second);
  });

  test("different IPs produce different hashes", () => {
    const first = buildMutationRequestMeta(
      createRequest({ "x-forwarded-for": "1.2.3.4" }),
      testAppConfig,
    );
    const second = buildMutationRequestMeta(
      createRequest({ "x-forwarded-for": "5.6.7.8" }),
      testAppConfig,
    );

    expect(typeof first.ipHash === "string").toBe(true);
    expect(typeof second.ipHash === "string").toBe(true);
    expect(first.ipHash === second.ipHash).toBe(false);
  });
});
