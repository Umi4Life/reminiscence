import { redirect } from "@sveltejs/kit";

import { claimAccess } from "$lib/api";

import type { PageLoad } from "./$types";

// Claim must run in the browser so the API Set-Cookie lands on the client.
// SSR would call the API from the SvelteKit server and never forward the session.
export const ssr = false;

export const load: PageLoad = async ({ params, fetch }) => {
  const result = await claimAccess(params.accessCode, fetch);

  if (result.claimed) {
    // The claim succeeded server-side and a session cookie was issued. We tag the
    // redirect so the board page can tell a fresh claim apart from a plain visit
    // and, if the cookie failed to persist (browser blocking cookies), surface an
    // honest notice instead of silently hiding the controls.
    redirect(302, `/b/${result.board.publicSlug}?claimed=1`);
  }

  return { result };
};
