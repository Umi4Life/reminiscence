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

export function adminOriginOf(config: AppConfig): string {
  return new URL(config.adminAppUrl).origin;
}

export function isAdminMutationRequest(request: Request): boolean {
  if (!MUTATING_METHODS.has(request.method)) {
    return false;
  }

  return new URL(request.url).pathname.startsWith(ADMIN_PATH_PREFIX);
}

/**
 * Returns true when the request must be rejected as a probable cross-site
 * forgery: an admin mutation carrying an `Origin` that is not the admin app.
 */
export function isForbiddenAdminCrossOrigin(request: Request, adminOrigin: string): boolean {
  if (!isAdminMutationRequest(request)) {
    return false;
  }

  const origin = request.headers.get("origin");
  return origin !== null && origin !== adminOrigin;
}
