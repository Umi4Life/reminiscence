import { Elysia } from "elysia";

import * as schemas from "./schemas";

// Registers reusable schemas as named Elysia models. Route plugins
// `.use(apiModels)` and reference these by name at a top-level route slot
// (`body: "LoginBody"`, `params: "BoardIdParams"`, `response: { 404: "ErrorResponse" }`).
// The `@elysia/openapi` plugin emits each as a reusable
// `#/components/schemas/<name>` entry with a correct `$ref` from the operation.
//
// Only schemas referenced at top-level slots are registered here. Response
// *data* shapes stay inlined via the `success()` helper: this plugin version
// emits a bare (non-`#/components/schemas/...`) `$ref` for models nested inside
// another schema, which is not valid under the document's OpenAPI 3.0.3 version
// — so nested references are avoided and the data is inlined instead.
//
// This is the `.model()` grouping Elysia's best-practice guide recommends,
// layered on top of the raw TypeBox schemas in schemas.ts.
export const apiModels = new Elysia({ name: "api-models" }).model({
  // Request bodies
  LoginBody: schemas.LoginBody,
  ChangePasswordBody: schemas.ChangePasswordBody,
  ClaimAccessBody: schemas.ClaimAccessBody,
  AddEntryBody: schemas.AddEntryBody,
  CreateOrganizationBody: schemas.CreateOrganizationBody,
  PatchOrganizationBody: schemas.PatchOrganizationBody,
  CreateVenueBody: schemas.CreateVenueBody,
  PatchVenueBody: schemas.PatchVenueBody,
  CreateBoardBody: schemas.CreateBoardBody,
  PatchBoardBody: schemas.PatchBoardBody,
  AssignMembershipBody: schemas.AssignMembershipBody,
  CreateAdminBody: schemas.CreateAdminBody,
  PatchAdminBody: schemas.PatchAdminBody,
  AdminPasswordResetBody: schemas.AdminPasswordResetBody,

  // Path params & query strings
  OrgIdParams: schemas.OrgIdParams,
  MembershipIdParams: schemas.MembershipIdParams,
  VenueIdParams: schemas.VenueIdParams,
  BoardIdParams: schemas.BoardIdParams,
  AdminUserIdParams: schemas.AdminUserIdParams,
  PublicSlugParams: schemas.PublicSlugParams,
  EntryParams: schemas.EntryParams,
  DisplayTokenParams: schemas.DisplayTokenParams,
  EventsQuery: schemas.EventsQuery,
  AuditEventsQuery: schemas.AuditEventsQuery,

  // Error envelope (referenced at the response slot on nearly every route)
  ErrorResponse: schemas.ErrorResponse,
});
