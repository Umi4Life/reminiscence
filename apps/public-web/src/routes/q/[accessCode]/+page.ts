import { redirect } from "@sveltejs/kit";

import { claimAccess } from "$lib/api";

import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params, fetch }) => {
  const result = await claimAccess(params.accessCode, fetch);

  if (result.claimed) {
    redirect(302, `/b/${result.board.publicSlug}`);
  }

  return { result };
};
