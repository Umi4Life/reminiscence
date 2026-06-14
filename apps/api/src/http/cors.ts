import type { AppConfig } from "@queue-reminiscence/config";

/**
 * Cross-origin support for the cookie-authenticated API.
 *
 * Because auth is cookie-based, CORS must be strict: we only ever echo an
 * origin that is on an explicit allowlist derived from the configured app URLs,
 * always paired with `Access-Control-Allow-Credentials: true`. We never reflect
 * an arbitrary `Origin`, and never use `*` — either would turn this into a
 * credential-theft hole.
 */

const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS = "content-type, x-requested-with";
const PREFLIGHT_MAX_AGE_SECONDS = "600";

export function buildAllowedOrigins(config: AppConfig): Set<string> {
  return new Set([config.publicAppUrl, config.adminAppUrl].map((url) => new URL(url).origin));
}

export interface CorsDecision {
  headers: Record<string, string>;
  preflight: boolean;
}

/**
 * Computes the CORS response headers for a request. Returns `preflight: true`
 * for `OPTIONS` so the caller can short-circuit with a 204.
 */
export function resolveCors(allowedOrigins: Set<string>, request: Request): CorsDecision {
  const headers: Record<string, string> = { vary: "Origin" };
  const origin = request.headers.get("origin");

  if (origin && allowedOrigins.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-credentials"] = "true";
    headers["access-control-allow-methods"] = ALLOWED_METHODS;
    headers["access-control-allow-headers"] = ALLOWED_HEADERS;
    headers["access-control-max-age"] = PREFLIGHT_MAX_AGE_SECONDS;
  }

  return { headers, preflight: request.method === "OPTIONS" };
}
