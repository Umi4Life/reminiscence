import { t, type TSchema } from "elysia";

// ---------------------------------------------------------------------------
// Single source of truth for the HTTP layer's request and response schemas.
//
// These TypeBox schemas drive three things at once: runtime validation, the
// generated OpenAPI document (via `@elysia/openapi`), and end-to-end types.
//
// Two behaviours of Elysia's validator shaped the choices here, both verified
// empirically against the pinned runtime:
//   1. `normalize` (on by default) STRIPS response fields absent from the
//      schema. So response objects must enumerate every field a consumer reads.
//   2. Only the matching declared status code is validated. Error responses are
//      emitted through the app-level `onError`, which bypasses per-route
//      response validation — so the error entries below are documentation only.
//   3. `Date` values must be typed `t.Date()` (validates a Date instance and
//      serialises to an ISO string). `t.String()` on a Date throws at runtime.
//
// Response id fields use a plain `t.String()` (no `format: "uuid"`) so response
// validation can never reject a value on a format technicality.
// ---------------------------------------------------------------------------

const SlugPattern = "^[a-z0-9._~-]+$";
const UuidPattern = "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";

// ---------------------------------------------------------------------------
// Enums (mirror packages/db pgEnum definitions)
// ---------------------------------------------------------------------------
export const BoardStatus = t.Union([t.Literal("open"), t.Literal("closed")], {
  description: "Whether the board is currently accepting participants.",
});
export const PublicViewPolicy = t.Union([t.Literal("open"), t.Literal("access_code_required")], {
  description: "Controls who can view the public board page.",
});
export const PublicMutationPolicy = t.Union(
  [t.Literal("access_code_required"), t.Literal("staff_only"), t.Literal("disabled")],
  { description: "Controls who can add or remove queue entries." },
);
export const QrRotationPolicy = t.Union([t.Literal("manual"), t.Literal("scheduled")]);
export const QueueEntryStatus = t.Union([t.Literal("active"), t.Literal("removed")]);
export const BoardEventType = t.Union([
  t.Literal("entry_added"),
  t.Literal("entry_removed"),
  t.Literal("entry_restored"),
  t.Literal("board_reset"),
  t.Literal("board_opened"),
  t.Literal("board_closed"),
  t.Literal("access_rotated"),
]);
export const AdminMembershipRole = t.Union([
  t.Literal("org_owner"),
  t.Literal("venue_manager"),
  t.Literal("venue_staff"),
]);

// ---------------------------------------------------------------------------
// Response envelope helpers
// ---------------------------------------------------------------------------
export const ErrorCode = t.Union([
  t.Literal("validation_error"),
  t.Literal("unauthorized"),
  t.Literal("forbidden"),
  t.Literal("not_found"),
  t.Literal("conflict"),
  t.Literal("rate_limited"),
  t.Literal("internal_error"),
]);

/** `{ ok: false, error: { code, message } }` — the shape `apiFailure` emits. */
export const ErrorResponse = t.Object(
  {
    ok: t.Literal(false),
    error: t.Object({ code: ErrorCode, message: t.String() }),
  },
  { description: "Standard error envelope." },
);

/** Wrap a data schema in the `{ ok: true, data }` success envelope. */
export const success = <T extends TSchema>(data: T) => t.Object({ ok: t.Literal(true), data });

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------
export const PASSWORD_MIN_LENGTH = 8;

export const LoginBody = t.Object({
  email: t.String({ minLength: 1, description: "Admin email address." }),
  password: t.String({ minLength: 1, description: "Admin password." }),
});

export const ChangePasswordBody = t.Object({
  currentPassword: t.String({ minLength: 1, description: "Current admin password." }),
  newPassword: t.String({
    minLength: PASSWORD_MIN_LENGTH,
    description: `New admin password (minimum ${PASSWORD_MIN_LENGTH} characters).`,
  }),
});

export const ClaimAccessBody = t.Object({
  accessCode: t.String({
    minLength: 1,
    description: "Raw access code from a QR scan or URL parameter.",
  }),
});

export const AddEntryBody = t.Object({
  displayName: t.String({
    minLength: 1,
    description: "Name to display in the queue. Whitespace is trimmed and collapsed.",
  }),
});

export const CreateOrganizationBody = t.Object({
  slug: t.String({ minLength: 1, description: "Globally unique organization slug." }),
  name: t.String({ minLength: 1, description: "Organization display name." }),
});

export const PatchOrganizationBody = t.Object({
  slug: t.Optional(t.String({ minLength: 1 })),
  name: t.Optional(t.String({ minLength: 1 })),
});

export const CreateBoardBody = t.Object({
  venueId: t.String({ pattern: UuidPattern, description: "Venue that owns the board." }),
  slug: t.String({ minLength: 1, description: "Unique within the venue." }),
  publicSlug: t.String({
    minLength: 1,
    description: "Globally unique. Used in public board URLs.",
  }),
  name: t.String({ minLength: 1 }),
  description: t.Optional(t.Nullable(t.String())),
  status: t.Optional(t.Literal("closed")),
  publicViewPolicy: t.Optional(PublicViewPolicy),
  publicAddPolicy: t.Optional(PublicMutationPolicy),
  publicRemovePolicy: t.Optional(PublicMutationPolicy),
  qrRotationPolicy: t.Optional(t.Literal("manual")),
  qrRotationIntervalMinutes: t.Optional(t.Null()),
});

export const PatchBoardBody = t.Object({
  slug: t.Optional(t.String({ minLength: 1 })),
  publicSlug: t.Optional(t.String({ minLength: 1 })),
  name: t.Optional(t.String({ minLength: 1 })),
  description: t.Optional(t.Nullable(t.String())),
  publicViewPolicy: t.Optional(PublicViewPolicy),
  publicAddPolicy: t.Optional(PublicMutationPolicy),
  publicRemovePolicy: t.Optional(PublicMutationPolicy),
});

export const CreateVenueBody = t.Object({
  organizationId: t.String({
    pattern: UuidPattern,
    description: "Organisation that owns the venue.",
  }),
  slug: t.String({ minLength: 1, description: "Unique within the organisation." }),
  name: t.String({ minLength: 1 }),
  timezone: t.String({ minLength: 1, description: "IANA timezone name, e.g. Asia/Bangkok." }),
  address: t.Optional(t.Nullable(t.String())),
});

export const PatchVenueBody = t.Object({
  slug: t.Optional(t.String({ minLength: 1 })),
  name: t.Optional(t.String({ minLength: 1 })),
  timezone: t.Optional(t.String({ minLength: 1 })),
  address: t.Optional(t.Nullable(t.String())),
});

// ---------------------------------------------------------------------------
// Path params & query strings
// ---------------------------------------------------------------------------
export const OrgIdParams = t.Object({
  orgId: t.String({ description: "Organization identifier (UUID)." }),
});

export const VenueIdParams = t.Object({
  venueId: t.String({ description: "Venue identifier (UUID)." }),
});

export const BoardIdParams = t.Object({
  boardId: t.String({ description: "Board identifier (UUID)." }),
});
export const PublicSlugParams = t.Object({
  publicSlug: t.String({ description: "Public board slug.", pattern: SlugPattern }),
});
export const EntryParams = t.Object({
  publicSlug: t.String({ description: "Public board slug." }),
  entryId: t.String({ description: "Queue entry identifier." }),
});
export const DisplayTokenParams = t.Object({
  displayToken: t.String({ description: "Opaque display device token provisioned by an admin." }),
});

export const EventsQuery = t.Object({
  limit: t.Optional(
    t.Numeric({ minimum: 1, description: "Maximum events to return (1–100, default 20)." }),
  ),
});

// ---------------------------------------------------------------------------
// Response data shapes (mirror the service return types exactly)
// ---------------------------------------------------------------------------
export const OrganizationSummary = t.Object({
  id: t.String(),
  slug: t.String(),
  name: t.String(),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

export const VenueSummary = t.Object({
  id: t.String(),
  organizationId: t.String(),
  slug: t.String(),
  name: t.String(),
  timezone: t.String(),
  address: t.Nullable(t.String()),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

export const BoardSummary = t.Object({
  id: t.String(),
  venueId: t.String(),
  organizationId: t.String(),
  slug: t.String(),
  publicSlug: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  status: BoardStatus,
  publicViewPolicy: PublicViewPolicy,
  publicAddPolicy: PublicMutationPolicy,
  publicRemovePolicy: PublicMutationPolicy,
  qrRotationPolicy: QrRotationPolicy,
  qrRotationIntervalMinutes: t.Nullable(t.Number()),
  nextSortOrder: t.Number(),
  displayVersion: t.Number(),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

export const AdminIdentity = t.Object({
  id: t.String(),
  email: t.String(),
  displayName: t.String(),
  isSuperAdmin: t.Boolean(),
});

export const AdminMembershipSummary = t.Object({
  id: t.String(),
  organizationId: t.String(),
  venueId: t.Nullable(t.String()),
  role: AdminMembershipRole,
});

export const AdminSessionContext = t.Object({
  admin: AdminIdentity,
  memberships: t.Array(AdminMembershipSummary),
});

export const RotatedBoardAccessCredential = t.Object({
  id: t.String(),
  accessUrl: t.String(),
  tokenPreview: t.String(),
  version: t.Number(),
  expiresAt: t.Nullable(t.Date()),
});

export const PublicBoardReadData = t.Object({
  organization: t.Object({ id: t.String(), slug: t.String(), name: t.String() }),
  venue: t.Object({ id: t.String(), slug: t.String(), name: t.String() }),
  board: t.Object({
    publicSlug: t.String(),
    name: t.String(),
    description: t.Nullable(t.String()),
    status: BoardStatus,
    publicAddPolicy: PublicMutationPolicy,
    publicRemovePolicy: PublicMutationPolicy,
    displayVersion: t.Number(),
    updatedAt: t.Date(),
  }),
  queue: t.Array(
    t.Object({
      id: t.String(),
      displayName: t.String(),
      position: t.Number(),
      sortOrder: t.Number(),
      createdAt: t.Date(),
    }),
  ),
  mutationAccess: t.Object({
    available: t.Boolean(),
    expiresAt: t.Nullable(t.Date()),
    canAdd: t.Boolean(),
    canRemove: t.Boolean(),
  }),
});

export const PublicBoardEventItem = t.Object({
  id: t.String(),
  type: BoardEventType,
  publicMessage: t.String(),
  displayNameSnapshot: t.Nullable(t.String()),
  createdAt: t.Date(),
});

export const PublicQueueEntryResult = t.Object({
  id: t.String(),
  displayName: t.String(),
  position: t.Number(),
  sortOrder: t.Number(),
  status: QueueEntryStatus,
  createdAt: t.Date(),
});

export const DisplayStatePayload = t.Object({
  board: t.Object({
    publicSlug: t.String(),
    name: t.String(),
    venueName: t.String(),
    organizationName: t.String(),
    status: BoardStatus,
  }),
  queue: t.Array(t.Object({ position: t.Number(), displayName: t.String() })),
  queueLength: t.Number(),
  publicAccess: t.Nullable(
    t.Object({
      url: t.String(),
      qrSvgUrl: t.String(),
      expiresAt: t.Nullable(t.String()),
      version: t.Number(),
    }),
  ),
  updatedAt: t.String(),
  displayVersion: t.Number(),
});

const ClaimBoardRef = t.Object({ id: t.String(), publicSlug: t.String() });

// Flattened rather than a discriminated union: the handler's return type widens
// `claimed` to `boolean`, which a literal-discriminated union would reject at
// compile time. All non-`claimed` fields are optional and present per outcome:
//   claimed=true  -> board + mutationAccessExpiresAt
//   claimed=false -> reason + message (+ board for expired/revoked)
export const ClaimAccessResult = t.Object({
  claimed: t.Boolean({ description: "Whether a mutation session was granted." }),
  board: t.Optional(ClaimBoardRef),
  mutationAccessExpiresAt: t.Optional(t.Date()),
  reason: t.Optional(
    t.Union([t.Literal("expired"), t.Literal("revoked"), t.Literal("invalid")], {
      description: "Why the claim was not granted (present when claimed is false).",
    }),
  ),
  message: t.Optional(t.String()),
});
