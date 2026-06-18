import type { AdminAuthService, AdminSessionContext } from "./admin-sessions";
import { ADMIN_SESSION_COOKIE_NAME } from "./admin-sessions";
import { unauthorizedError } from "../http/errors";

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
      try {
        cookies.set(name, decodeURIComponent(value));
      } catch {
        cookies.set(name, value);
      }
    }
  }

  return cookies;
}

export function readAdminSessionToken(headers: Headers): string | undefined {
  return parseCookieHeader(headers.get("cookie")).get(ADMIN_SESSION_COOKIE_NAME);
}

export async function requireAdminSession(
  authService: AdminAuthService,
  headers: Headers,
): Promise<AdminSessionContext> {
  const token = readAdminSessionToken(headers);

  if (!token) {
    throw unauthorizedError();
  }

  return authService.resolve(token);
}
