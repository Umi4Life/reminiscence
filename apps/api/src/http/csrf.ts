import type { AppConfig } from "@queue-reminiscence/config";

/**
 * CSRF defense-in-depth for admin mutations.
 *
 * Admin cookies are already `SameSite=Lax`, which blocks cross-site POSTs in
 * current browsers — this is a second layer the architecture (§11.1) asks for.
 * A cross-site browser request always carries an `Origin` header on a
 * state-changing method; if that origin is not the configured admin app, we
 * reject it. Requests with no `Origin` (non-browser clients, same-origin GETs)
 * are unaffected, so existing server-to-server and test traffic still works.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ADMIN_PATH_PREFIX = "/api/admin/";
const PUBLIC_PATH_PREFIX = "/api/public/";

export function adminOriginOf(config: AppConfig): string {
  return new URL(config.adminAppUrl).origin;
}

export function publicOriginOf(config: AppConfig): string {
  return new URL(config.publicAppUrl).origin;
}

function isMutationUnderPrefix(request: Request, prefix: string): boolean {
  if (!MUTATING_METHODS.has(request.method)) {
    return false;
  }

  return new URL(request.url).pathname.startsWith(prefix);
}

export function isAdminMutationRequest(request: Request): boolean {
  return isMutationUnderPrefix(request, ADMIN_PATH_PREFIX);
}

export function isPublicMutationRequest(request: Request): boolean {
  return isMutationUnderPrefix(request, PUBLIC_PATH_PREFIX);
}

/**
 * Returns true when an `Origin` header is present and does not match the
 * expected app origin. A missing `Origin` (non-browser clients, same-origin
 * GETs) is treated as allowed, matching the documented gate contract: browsers
 * always attach `Origin` to cross-site state-changing requests, so a foreign
 * value is the forgery signal we reject on.
 */
function hasForeignOrigin(request: Request, expectedOrigin: string): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin !== expectedOrigin;
}

/**
 * Returns true when the request must be rejected as a probable cross-site
 * forgery: an admin mutation carrying an `Origin` that is not the admin app.
 */
export function isForbiddenAdminCrossOrigin(request: Request, adminOrigin: string): boolean {
  if (!isAdminMutationRequest(request)) {
    return false;
  }

  return hasForeignOrigin(request, adminOrigin);
}

/**
 * Defense-in-depth for public cookie-authenticated mutations (`SameSite=Lax`
 * sessions). Rejects a public mutation carrying an `Origin` that is not the
 * public app. The `/claim` endpoint is not cookie-authenticated, but legitimate
 * browser claims still originate from the public app, so the same gate applies
 * cleanly. Server-to-server / curl traffic (no `Origin`) is unaffected.
 */
export function isForbiddenPublicCrossOrigin(request: Request, publicOrigin: string): boolean {
  if (!isPublicMutationRequest(request)) {
    return false;
  }

  return hasForeignOrigin(request, publicOrigin);
}
