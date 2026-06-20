import { requireSession } from "$lib/session";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ parent }) => {
  const { session } = await parent();
  requireSession(session);
  return {};
};
