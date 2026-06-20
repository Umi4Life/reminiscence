import type { AppConfig } from "@queue-reminiscence/config";
import { Elysia, t } from "elysia";

import type { AdminAuthService, AdminSessionContext, LoginResult } from "../auth/admin-sessions";
import { ADMIN_SESSION_COOKIE_NAME } from "../auth/admin-sessions";
import { readAdminSessionToken } from "../auth/admin-route-auth";
import { unauthorizedError } from "../http/errors";
import { apiSuccess } from "../http/response";
import { apiModels } from "../http/models";
import { API_TAGS } from "../http/openapi-config";
import { AdminSessionContext as AdminSessionContextSchema, success } from "../http/schemas";
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
const CHANGE_PASSWORD_LIMIT = {
  scope: "admin_change_password",
  windowSeconds: 300,
  maxCount: 10,
} as const;

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

async function enforceChangePasswordRateLimit(
  rateLimiter: RateLimiter,
  config: AppConfig,
  request: Request,
): Promise<void> {
  const ipKey = hashClientIp(request, config) ?? "unknown";
  await rateLimiter.checkAndIncrement({ ...CHANGE_PASSWORD_LIMIT, bucketKey: ipKey });
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
    .use(apiModels)
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
        body: "LoginBody",
        response: {
          200: success(AdminSessionContextSchema),
          400: "ErrorResponse",
          401: "ErrorResponse",
          429: "ErrorResponse",
        },
        detail: {
          summary: "Admin login",
          description:
            "Authenticates an admin and sets the `qr_admin_session` cookie. Rate limited per IP and per email.",
          tags: [API_TAGS.adminAuth],
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
        response: { 200: success(t.Object({ loggedOut: t.Literal(true) })) },
        detail: {
          summary: "Admin logout",
          description: "Revokes the current admin session and clears the session cookie.",
          tags: [API_TAGS.adminAuth],
        },
      },
    )
    .post(
      "/api/admin/auth/change-password",
      async ({ body, request }) => {
        const token = readAdminSessionToken(request.headers);

        if (!token) {
          throw unauthorizedError();
        }

        await enforceChangePasswordRateLimit(deps.rateLimiter, deps.config, request);

        const context = await deps.authService.resolve(token);

        await deps.authService.changePassword(
          context.admin.id,
          body.currentPassword,
          body.newPassword,
          token,
        );

        return apiSuccess({ changed: true as const });
      },
      {
        body: "ChangePasswordBody",
        response: {
          200: success(t.Object({ changed: t.Literal(true) })),
          400: "ErrorResponse",
          401: "ErrorResponse",
          429: "ErrorResponse",
        },
        detail: {
          summary: "Change admin password",
          description:
            "Changes the authenticated admin's password and revokes all other active sessions.",
          tags: [API_TAGS.adminAuth],
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
        response: { 200: success(AdminSessionContextSchema), 401: "ErrorResponse" },
        detail: {
          summary: "Current admin context",
          description: "Returns the authenticated admin identity and their memberships.",
          tags: [API_TAGS.adminAuth],
          security: [{ AdminSession: [] }],
        },
      },
    );
}
