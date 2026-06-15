import { t } from "elysia";

const SlugPattern = "^[a-z0-9._~-]+$";

// Enums
export const BoardStatus = t.Union([t.Literal("open"), t.Literal("closed")]);
export const PublicViewPolicy = t.Union([t.Literal("open"), t.Literal("access_code_required")]);
export const PublicMutationPolicy = t.Union([
  t.Literal("access_code_required"),
  t.Literal("staff_only"),
  t.Literal("disabled"),
]);
export const QrRotationPolicy = t.Union([t.Literal("manual"), t.Literal("scheduled")]);

// Request bodies
export const LoginBody = t.Object({
  email: t.String({ minLength: 1, description: "Admin email address." }),
  password: t.String({ minLength: 1, description: "Admin password." }),
});

export const ClaimAccessBody = t.Object({
  accessCode: t.String({ minLength: 1, description: "Raw access code from a QR scan or URL parameter." }),
});

export const AddEntryBody = t.Object({
  displayName: t.String({
    minLength: 1,
    maxLength: 40,
    description: "Name to display in the queue. Whitespace is trimmed and collapsed.",
  }),
});

export const CreateBoardBody = t.Object({
  venueId: t.String({ format: "uuid" }),
  slug: t.String({ pattern: SlugPattern, description: "Unique within the venue." }),
  publicSlug: t.String({ pattern: SlugPattern, description: "Globally unique. Used in public board URLs." }),
  name: t.String({ minLength: 1 }),
  description: t.Optional(t.Nullable(t.String())),
  publicViewPolicy: t.Optional(PublicViewPolicy),
  publicAddPolicy: t.Optional(PublicMutationPolicy),
  publicRemovePolicy: t.Optional(PublicMutationPolicy),
});

export const PatchBoardBody = t.Object(
  {
    slug: t.Optional(t.String({ pattern: SlugPattern })),
    publicSlug: t.Optional(t.String({ pattern: SlugPattern })),
    name: t.Optional(t.String({ minLength: 1 })),
    description: t.Optional(t.Nullable(t.String())),
    publicViewPolicy: t.Optional(PublicViewPolicy),
    publicAddPolicy: t.Optional(PublicMutationPolicy),
    publicRemovePolicy: t.Optional(PublicMutationPolicy),
  },
  { additionalProperties: true },
);

// Path params
export const BoardIdParams = t.Object({ boardId: t.String({ format: "uuid" }) });
export const PublicSlugParams = t.Object({ publicSlug: t.String() });
export const EntryParams = t.Object({
  publicSlug: t.String(),
  entryId: t.String(),
});
export const DisplayTokenParams = t.Object({
  displayToken: t.String({ description: "Opaque display device token provisioned by an admin." }),
});

// Query strings
export const EventsQuery = t.Object({
  limit: t.Optional(t.String({ description: "Maximum events to return (1–100, default 20)." })),
});
