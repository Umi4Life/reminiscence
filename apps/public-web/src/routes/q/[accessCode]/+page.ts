import { redirect } from "@sveltejs/kit";

import { claimAccess } from "$lib/api";

import type { PageLoad } from "./$types";

// Claim must run in the browser so the API Set-Cookie lands on the client.
// SSR would call the API from the SvelteKit server and never forward the session.
export const ssr = false;

export const load: PageLoad = async ({ params, fetch }) => {
  const result = await claimAccess(params.accessCode, fetch);

  if (result.claimed) {
    redirect(302, `/b/${result.board.publicSlug}`);
  }

  return { result };
};
