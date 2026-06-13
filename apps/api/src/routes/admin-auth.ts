import type { AppConfig } from "@queue-reminiscence/config";
import { Elysia } from "elysia";

import type { AdminAuthService, AdminSessionContext, LoginResult } from "../auth/admin-sessions";
import { ADMIN_SESSION_COOKIE_NAME } from "../auth/admin-sessions";
import { readAdminSessionToken } from "../auth/admin-route-auth";
import { unauthorizedError, validationError } from "../http/errors";
import { apiSuccess } from "../http/response";

export interface AdminAuthRouteDeps {
  authService: AdminAuthService;
  config: AppConfig;
}

interface LoginBody {
  email?: unknown;
  password?: unknown;
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

function parseLoginBody(body: unknown): { email: string; password: string } {
  const candidate = body as LoginBody | null;

  if (
    !candidate ||
    typeof candidate.email !== "string" ||
    typeof candidate.password !== "string" ||
    candidate.email.trim().length === 0 ||
    candidate.password.length === 0
  ) {
    throw validationError("Email and password are required.");
  }

  return {
    email: candidate.email,
    password: candidate.password,
  };
}

function serializeLoginResult(result: LoginResult): AdminSessionContext {
  return {
    admin: result.admin,
    memberships: result.memberships,
  };
}

export function adminAuthRoutes(deps: AdminAuthRouteDeps) {
  return new Elysia({ name: "admin-auth-routes" })
    .post("/api/admin/auth/login", async ({ body, set }) => {
      const credentials = parseLoginBody(body);
      const result = await deps.authService.login(credentials.email, credentials.password);

      set.headers["set-cookie"] = serializeSessionCookie(
        result.token,
        deps.config,
        result.expiresAt,
      );

      return apiSuccess(serializeLoginResult(result));
    })
    .post("/api/admin/auth/logout", async ({ request, set }) => {
      const token = readAdminSessionToken(request.headers);

      if (token) {
        await deps.authService.logout(token);
      }

      set.headers["set-cookie"] = serializeExpiredSessionCookie(deps.config);

      return apiSuccess({ loggedOut: true });
    })
    .get("/api/admin/me", async ({ request }) => {
      const token = readAdminSessionToken(request.headers);

      if (!token) {
        throw unauthorizedError();
      }

      const context = await deps.authService.resolve(token);
      return apiSuccess(context);
    });
}
