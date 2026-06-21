import { env } from "$env/dynamic/public";

// Default to a relative path so browser API calls stay same-origin and route
// through the Vite dev proxy (vite.config.ts) — this keeps the API on whatever
// host loaded the page (localhost, a LAN IP, or the prod domain), so SameSite
// cookies work and there's no cross-origin/CORS hop. Set PUBLIC_API_BASE_URL to
// an absolute URL only for a built preview that has no proxy in front.
export const API_BASE_URL: string = env.PUBLIC_API_BASE_URL ?? "/api";
