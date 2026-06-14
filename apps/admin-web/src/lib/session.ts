import { redirect } from "@sveltejs/kit";

import { getMe, type MeData } from "./api";

type FetchFn = typeof globalThis.fetch;

export async function loadSession(fetchFn: FetchFn = globalThis.fetch): Promise<MeData | null> {
  try {
    return await getMe(fetchFn);
  } catch {
    return null;
  }
}

export function requireSession(session: MeData | null): MeData {
  if (!session) {
    throw redirect(302, "/login");
  }

  return session;
}
