import type { AppConfig } from "@queue-reminiscence/config";
import { Elysia } from "elysia";

import {
  PUBLIC_BOARD_SESSION_COOKIE_NAME,
  type ClaimPublicAccessResult,
  type PublicSessionService,
} from "../auth/public-sessions";
import { validationError } from "../http/errors";
import { apiSuccess } from "../http/response";
import { hashClientIp } from "../public/audit-metadata";
import type { RateLimiter } from "../rate-limit/rate-limiter";

export interface PublicAccessRouteDeps {
  config: AppConfig;
  publicSessionService: PublicSessionService;
  rateLimiter: RateLimiter;
}

// Throttle access claims per source IP. Without this, anyone holding a valid
// access code could mint unlimited fresh public sessions, each with a clean
// per-session mutation budget — making the per-session limits decorative.
const CLAIM_IP_LIMIT = { scope: "claim_ip_1m", windowSeconds: 60, maxCount: 10 } as const;
const CLAIM_IP_BURST = { scope: "claim_ip_10m", windowSeconds: 600, maxCount: 40 } as const;

async function enforceClaimRateLimit(
  rateLimiter: RateLimiter,
  config: AppConfig,
  request: Request,
): Promise<void> {
  const ipKey = hashClientIp(request, config) ?? "unknown";
  await rateLimiter.checkAndIncrement({ ...CLAIM_IP_LIMIT, bucketKey: ipKey });
  await rateLimiter.checkAndIncrement({ ...CLAIM_IP_BURST, bucketKey: ipKey });
}

interface ClaimBody {
  accessCode?: unknown;
}

function parseCookieHeader(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();

  if (!header) {
    return cookies;
  }

  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const name = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (name.length > 0) {
      cookies.set(name, decodeURIComponent(value));
    }
  }

  return cookies;
}

export function readPublicBoardSessionToken(headers: Headers): string | undefined {
  return parseCookieHeader(headers.get("cookie")).get(PUBLIC_BOARD_SESSION_COOKIE_NAME);
}

function parseClaimBody(body: unknown): string {
  const candidate = body as ClaimBody | null;

  if (
    !candidate ||
    typeof candidate.accessCode !== "string" ||
    candidate.accessCode.trim().length === 0
  ) {
    throw validationError("Access code is required.");
  }

  return candidate.accessCode.trim();
}

function serializePublicSessionCookie(
  token: string,
  config: AppConfig,
  expiresAt?: Date,
  maxAgeSeconds?: number,
): string {
  const parts = [
    `${PUBLIC_BOARD_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (expiresAt) {
    parts.push(`Expires=${expiresAt.toUTCString()}`);
  }

  if (maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }

  if (
    config.publicAppUrl.startsWith("https://") ||
    config.apiPublicBaseUrl.startsWith("https://")
  ) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function serializeExpiredPublicSessionCookie(config: AppConfig): string {
  return serializePublicSessionCookie("", config, new Date(0), 0);
}

function responseForClaim(result: ClaimPublicAccessResult) {
  if (result.status === "claimed") {
    return {
      claimed: true,
      board: result.board,
      mutationAccessExpiresAt: result.mutationAccessExpiresAt,
    };
  }

  return {
    claimed: false,
    reason: result.status,
    ...("board" in result ? { board: result.board } : {}),
    message: result.message,
  };
}

export function publicAccessRoutes(deps: PublicAccessRouteDeps) {
  return new Elysia({ name: "public-access-routes" })
    .post("/api/public/access/claim", async ({ body, request, set }) => {
      await enforceClaimRateLimit(deps.rateLimiter, deps.config, request);
      const accessCode = parseClaimBody(body);
      const result = await deps.publicSessionService.claimAccess(accessCode);

      if (result.status === "claimed") {
        set.headers["set-cookie"] = serializePublicSessionCookie(
          result.token,
          deps.config,
          result.expiresAt,
        );
      }

      return apiSuccess(responseForClaim(result));
    })
    .post("/api/public/access/logout", async ({ request, set }) => {
      const token = readPublicBoardSessionToken(request.headers);

      if (token) {
        await deps.publicSessionService.logout(token);
      }

      set.headers["set-cookie"] = serializeExpiredPublicSessionCookie(deps.config);
      return apiSuccess({ loggedOut: true });
    });
}
