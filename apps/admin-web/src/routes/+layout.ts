import { redirect } from "@sveltejs/kit";

import { loadSession } from "$lib/session";
import type { LayoutLoad } from "./$types";

export const ssr = false;

export const load: LayoutLoad = async ({ url, fetch }) => {
  const session = await loadSession(fetch);
  const isLoginPage = url.pathname === "/login";

  if (!session && !isLoginPage) {
    throw redirect(302, "/login");
  }

  if (session && isLoginPage) {
    throw redirect(302, "/");
  }

  return { session };
};
