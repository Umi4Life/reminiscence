import type { AppConfig } from "@queue-reminiscence/config";
import { Elysia } from "elysia";

import {
  PUBLIC_BOARD_SESSION_COOKIE_NAME,
  type ClaimPublicAccessResult,
  type PublicSessionService,
} from "../auth/public-sessions";
import { validationError } from "../http/errors";
import { apiSuccess } from "../http/response";

export interface PublicAccessRouteDeps {
  config: AppConfig;
  publicSessionService: PublicSessionService;
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
    .post("/api/public/access/claim", async ({ body, set }) => {
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
