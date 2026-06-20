// Public type surface for API consumers (e.g. the SvelteKit web apps via Eden
// Treaty). `App` carries the full typed route tree for `treaty<App>()`; the DTO
// aliases are derived from the same TypeBox schemas the server validates with,
// so clients never re-declare these shapes. Import via "@queue-reminiscence/api/types".
//
// This module is type-only in practice: importing it with `import type` erases
// it at build time, so no server runtime (db, drizzle, config) is bundled into a
// client.
import type { createApp } from "./app";
import type * as schemas from "./http/schemas";

export type App = ReturnType<typeof createApp>;

export type OrganizationSummary = (typeof schemas.OrganizationSummary)["static"];
export type VenueSummary = (typeof schemas.VenueSummary)["static"];
export type BoardSummary = (typeof schemas.BoardSummary)["static"];
export type AdminIdentity = (typeof schemas.AdminIdentity)["static"];
export type AdminMembershipSummary = (typeof schemas.AdminMembershipSummary)["static"];
export type AdminSessionContext = (typeof schemas.AdminSessionContext)["static"];
export type RotatedBoardAccessCredential = (typeof schemas.RotatedBoardAccessCredential)["static"];
export type PublicBoardReadData = (typeof schemas.PublicBoardReadData)["static"];
export type PublicBoardEventItem = (typeof schemas.PublicBoardEventItem)["static"];
export type PublicQueueEntryResult = (typeof schemas.PublicQueueEntryResult)["static"];
export type DisplayStatePayload = (typeof schemas.DisplayStatePayload)["static"];
export type ClaimAccessResult = (typeof schemas.ClaimAccessResult)["static"];
export type AdminUserSummary = (typeof schemas.AdminUserSummary)["static"];
export type AdminUserStatus = (typeof schemas.AdminUserStatus)["static"];
