import type { AppConfig } from "@queue-reminiscence/config";
import { createHmac } from "node:crypto";

import type { MutationRequestMeta } from "../queue/mutations";

function hashAuditValue(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

/**
 * Reads the client IP from `X-Forwarded-For`, taking the rightmost entry.
 *
 * Behind a single trusted proxy hop (e.g. Traefik), the rightmost value is the
 * address that proxy observed connecting to it — the real client. Entries to
 * the left are client-supplied and therefore spoofable, so we must not trust
 * them. This assumes exactly one trusted hop, which is the homelab deployment
 * shape; revisit if additional trusted proxies are introduced.
 */
function readForwardedClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");

  if (!forwarded) {
    return null;
  }

  const parts = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return parts.length > 0 ? (parts[parts.length - 1] ?? null) : null;
}

/**
 * Returns an HMAC of the client IP suitable for rate-limit keying and audit
 * metadata, or null when no trustworthy IP is available. Never returns the raw
 * IP, and never treats it as durable identity.
 */
export function hashClientIp(request: Request, config: AppConfig): string | null {
  const ip = config.trustProxy ? readForwardedClientIp(request) : null;
  return ip ? hashAuditValue(ip, config.rateLimitHmacSecret) : null;
}

export function buildMutationRequestMeta(request: Request, config: AppConfig): MutationRequestMeta {
  const userAgent = request.headers.get("user-agent");

  return {
    ipHash: hashClientIp(request, config),
    userAgentHash: userAgent ? hashAuditValue(userAgent, config.rateLimitHmacSecret) : null,
  };
}
