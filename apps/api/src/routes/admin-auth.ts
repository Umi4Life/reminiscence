import type { AppConfig } from "@queue-reminiscence/config";
import { Elysia } from "elysia";

import type { AdminAuthService, AdminSessionContext, LoginResult } from "../auth/admin-sessions";
import { ADMIN_SESSION_COOKIE_NAME } from "../auth/admin-sessions";
import { readAdminSessionToken } from "../auth/admin-route-auth";
import { unauthorizedError } from "../http/errors";
import { LoginBody } from "../http/schemas";
import { apiSuccess } from "../http/response";
import { hashClientIp } from "../public/audit-metadata";
import type { RateLimiter } from "../rate-limit/rate-limiter";
import { hashOpaqueToken } from "../security/tokens";

export interface AdminAuthRouteDeps {
  authService: AdminAuthService;
  config: AppConfig;
  rateLimiter: RateLimiter;
}

// Throttle admin login to blunt brute-force and credential-stuffing. We limit
// per source IP (catches stuffing across many emails) and per target email
// (catches focused brute force). Keys are HMAC-hashed so the rate-limit table
// never stores raw IPs or emails.
const LOGIN_IP_LIMIT = { scope: "admin_login_ip", windowSeconds: 300, maxCount: 10 } as const;
const LOGIN_EMAIL_LIMIT = { scope: "admin_login_email", windowSeconds: 900, maxCount: 8 } as const;

async function enforceLoginRateLimit(
  rateLimiter: RateLimiter,
  config: AppConfig,
  request: Request,
  email: string,
): Promise<void> {
  const ipKey = hashClientIp(request, config) ?? "unknown";
  const emailKey = hashOpaqueToken(email.trim().toLowerCase(), config.rateLimitHmacSecret);

  await rateLimiter.checkAndIncrement({ ...LOGIN_IP_LIMIT, bucketKey: ipKey });
  await rateLimiter.checkAndIncrement({ ...LOGIN_EMAIL_LIMIT, bucketKey: emailKey });
}

function serializeSessionCookie(
  token: string,
  config: AppConfig,
  expiresAt?: Date,
  maxAgeSeconds?: number,
): string {
  const parts = [
    `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
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

  if (config.adminAppUrl.startsWith("https://") || config.apiAdminBaseUrl.startsWith("https://")) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function serializeExpiredSessionCookie(config: AppConfig): string {
  return serializeSessionCookie("", config, new Date(0), 0);
}

function serializeLoginResult(result: LoginResult): AdminSessionContext {
  return {
    admin: result.admin,
    memberships: result.memberships,
  };
}

export function adminAuthRoutes(deps: AdminAuthRouteDeps) {
  return new Elysia({ name: "admin-auth-routes" })
    .post(
      "/api/admin/auth/login",
      async ({ body, request, set }) => {
        await enforceLoginRateLimit(deps.rateLimiter, deps.config, request, body.email);
        const result = await deps.authService.login(body.email, body.password);

        set.headers["set-cookie"] = serializeSessionCookie(
          result.token,
          deps.config,
          result.expiresAt,
        );

        return apiSuccess(serializeLoginResult(result));
      },
      {
        body: LoginBody,
        detail: {
          summary: "Admin login",
          description:
            "Authenticate with email and password. Sets qr_admin_session HttpOnly cookie on success.\n\nRate limits: 10 attempts per 5 min per IP; 8 per 15 min per email.",
          tags: ["Admin Auth"],
        },
      },
    )
    .post(
      "/api/admin/auth/logout",
      async ({ request, set }) => {
        const token = readAdminSessionToken(request.headers);

        if (token) {
          await deps.authService.logout(token);
        }

        set.headers["set-cookie"] = serializeExpiredSessionCookie(deps.config);

        return apiSuccess({ loggedOut: true });
      },
      {
        detail: {
          summary: "Admin logout",
          description: "Revokes the current admin session and clears the session cookie.",
          tags: ["Admin Auth"],
          security: [{ AdminSession: [] }],
        },
      },
    )
    .get(
      "/api/admin/me",
      async ({ request }) => {
        const token = readAdminSessionToken(request.headers);

        if (!token) {
          throw unauthorizedError();
        }

        const context = await deps.authService.resolve(token);
        return apiSuccess(context);
      },
      {
        detail: {
          summary: "Current admin context",
          description: "Returns the identity and membership list for the authenticated admin.",
          tags: ["Admin Auth"],
          security: [{ AdminSession: [] }],
        },
      },
    );
}
