import { desc, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const boardStatusEnum = pgEnum("board_status", ["open", "closed"]);

export const publicViewPolicyEnum = pgEnum("public_view_policy", ["open", "access_code_required"]);

export const publicMutationPolicyEnum = pgEnum("public_mutation_policy", [
  "access_code_required",
  "staff_only",
  "disabled",
]);

export const qrRotationPolicyEnum = pgEnum("qr_rotation_policy", ["manual", "scheduled"]);

export const queueEntryStatusEnum = pgEnum("queue_entry_status", ["active", "removed"]);

export const boardEventActorTypeEnum = pgEnum("board_event_actor_type", [
  "public",
  "admin",
  "system",
]);

export const boardEventTypeEnum = pgEnum("board_event_type", [
  "entry_added",
  "entry_removed",
  "entry_restored",
  "board_reset",
  "board_opened",
  "board_closed",
  "access_rotated",
]);

export const adminUserStatusEnum = pgEnum("admin_user_status", ["active", "disabled"]);

export const adminMembershipRoleEnum = pgEnum("admin_membership_role", [
  "org_owner",
  "venue_manager",
  "venue_staff",
]);

export const boardAccessCredentialStatusEnum = pgEnum("board_access_credential_status", [
  "active",
  "expired",
  "revoked",
]);

export const publicBoardSessionStatusEnum = pgEnum("public_board_session_status", [
  "active",
  "expired",
  "revoked",
]);

export const displayDeviceStatusEnum = pgEnum("display_device_status", ["active", "revoked"]);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique("organizations_slug_unique").on(table.slug)],
);

export const venues = pgTable(
  "venues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    address: text("address"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("venues_organization_slug_unique").on(table.organizationId, table.slug),
    index("venues_organization_id_idx").on(table.organizationId),
  ],
);

export const boards = pgTable(
  "boards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id),
    slug: varchar("slug", { length: 64 }).notNull(),
    publicSlug: varchar("public_slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    status: boardStatusEnum("status").notNull(),
    publicViewPolicy: publicViewPolicyEnum("public_view_policy").notNull(),
    publicAddPolicy: publicMutationPolicyEnum("public_add_policy").notNull(),
    publicRemovePolicy: publicMutationPolicyEnum("public_remove_policy").notNull(),
    qrRotationPolicy: qrRotationPolicyEnum("qr_rotation_policy").notNull(),
    qrRotationIntervalMinutes: integer("qr_rotation_interval_minutes"),
    nextSortOrder: integer("next_sort_order").notNull().default(1),
    displayVersion: integer("display_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("boards_venue_slug_unique").on(table.venueId, table.slug),
    unique("boards_public_slug_unique").on(table.publicSlug),
    index("boards_venue_id_idx").on(table.venueId),
  ],
);

export const queueEntries = pgTable(
  "queue_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id),
    displayName: varchar("display_name", { length: 40 }).notNull(),
    sortOrder: integer("sort_order").notNull(),
    status: queueEntryStatusEnum("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true, mode: "date" }),
    removedByEventId: uuid("removed_by_event_id").references((): AnyPgColumn => boardEvents.id),
  },
  (table) => [
    index("queue_entries_board_status_sort_order_idx").on(
      table.boardId,
      table.status,
      table.sortOrder,
    ),
  ],
);

export const boardEvents = pgTable(
  "board_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id),
    actorType: boardEventActorTypeEnum("actor_type").notNull(),
    actorAdminUserId: uuid("actor_admin_user_id"),
    type: boardEventTypeEnum("type").notNull(),
    entryId: uuid("entry_id").references((): AnyPgColumn => queueEntries.id),
    displayNameSnapshot: varchar("display_name_snapshot", { length: 40 }),
    publicMessage: text("public_message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("board_events_board_id_created_at_idx").on(table.boardId, desc(table.createdAt)),
  ],
);

export const auditMetadata = pgTable(
  "audit_metadata",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => boardEvents.id),
    ipHash: varchar("ip_hash", { length: 64 }),
    userAgentHash: varchar("user_agent_hash", { length: 64 }),
    publicSessionId: varchar("public_session_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("audit_metadata_event_id_idx").on(table.eventId)],
);

export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    status: adminUserStatusEnum("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [unique("admin_users_email_unique").on(table.email)],
);

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => adminUsers.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("admin_sessions_token_hash_unique").on(table.tokenHash),
    index("admin_sessions_admin_user_id_idx").on(table.adminUserId),
  ],
);

export const adminMemberships = pgTable(
  "admin_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => adminUsers.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    venueId: uuid("venue_id").references(() => venues.id),
    role: adminMembershipRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("admin_memberships_organization_id_idx").on(table.organizationId),
    index("admin_memberships_venue_id_idx").on(table.venueId),
    index("admin_memberships_admin_user_id_idx").on(table.adminUserId),
    uniqueIndex("admin_memberships_org_level_unique")
      .on(table.adminUserId, table.organizationId)
      .where(sql`${table.venueId} is null`),
    uniqueIndex("admin_memberships_venue_level_unique").on(
      table.adminUserId,
      table.organizationId,
      table.venueId,
    ),
  ],
);

export const boardAccessCredentials = pgTable(
  "board_access_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id),
    tokenHash: text("token_hash").notNull(),
    tokenPreview: varchar("token_preview", { length: 32 }).notNull(),
    version: integer("version").notNull(),
    status: boardAccessCredentialStatusEnum("status").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdByAdminUserId: uuid("created_by_admin_user_id"),
    revokedByAdminUserId: uuid("revoked_by_admin_user_id"),
  },
  (table) => [
    unique("board_access_credentials_token_hash_unique").on(table.tokenHash),
    index("board_access_credentials_board_status_version_idx").on(
      table.boardId,
      table.status,
      table.version,
    ),
    foreignKey({
      columns: [table.createdByAdminUserId],
      foreignColumns: [adminUsers.id],
      name: "board_access_credentials_created_by_admin_fk",
    }),
    foreignKey({
      columns: [table.revokedByAdminUserId],
      foreignColumns: [adminUsers.id],
      name: "board_access_credentials_revoked_by_admin_fk",
    }),
  ],
);

export const publicBoardSessions = pgTable(
  "public_board_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id),
    credentialId: uuid("credential_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: publicBoardSessionStatusEnum("status").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("public_board_sessions_token_hash_unique").on(table.tokenHash),
    index("public_board_sessions_board_status_idx").on(table.boardId, table.status),
    index("public_board_sessions_credential_id_idx").on(table.credentialId),
    foreignKey({
      columns: [table.credentialId],
      foreignColumns: [boardAccessCredentials.id],
      name: "public_board_sessions_credential_fk",
    }),
  ],
);

export const displayDevices = pgTable(
  "display_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id),
    name: varchar("name", { length: 255 }).notNull(),
    tokenHash: text("token_hash").notNull(),
    status: displayDeviceStatusEnum("status").notNull(),
    canViewPublicAccessPayload: boolean("can_view_public_access_payload").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("display_devices_token_hash_unique").on(table.tokenHash),
    index("display_devices_board_status_idx").on(table.boardId, table.status),
  ],
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: varchar("scope", { length: 64 }).notNull(),
    bucketKey: text("bucket_key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true, mode: "date" }).notNull(),
    count: integer("count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    unique("rate_limit_buckets_scope_bucket_window_unique").on(
      table.scope,
      table.bucketKey,
      table.windowStart,
    ),
    index("rate_limit_buckets_expires_at_idx").on(table.expiresAt),
  ],
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Venue = typeof venues.$inferSelect;
export type NewVenue = typeof venues.$inferInsert;
export type Board = typeof boards.$inferSelect;
export type NewBoard = typeof boards.$inferInsert;
export type QueueEntry = typeof queueEntries.$inferSelect;
export type NewQueueEntry = typeof queueEntries.$inferInsert;
export type BoardEvent = typeof boardEvents.$inferSelect;
export type NewBoardEvent = typeof boardEvents.$inferInsert;
export type AuditMetadata = typeof auditMetadata.$inferSelect;
export type NewAuditMetadata = typeof auditMetadata.$inferInsert;
export type AdminUser = typeof adminUsers.$inferSelect;
export type NewAdminUser = typeof adminUsers.$inferInsert;
export type AdminSession = typeof adminSessions.$inferSelect;
export type NewAdminSession = typeof adminSessions.$inferInsert;
export type AdminMembership = typeof adminMemberships.$inferSelect;
export type NewAdminMembership = typeof adminMemberships.$inferInsert;
export type BoardAccessCredential = typeof boardAccessCredentials.$inferSelect;
export type NewBoardAccessCredential = typeof boardAccessCredentials.$inferInsert;
export type PublicBoardSession = typeof publicBoardSessions.$inferSelect;
export type NewPublicBoardSession = typeof publicBoardSessions.$inferInsert;
export type DisplayDevice = typeof displayDevices.$inferSelect;
export type NewDisplayDevice = typeof displayDevices.$inferInsert;
export type RateLimitBucket = typeof rateLimitBuckets.$inferSelect;
export type NewRateLimitBucket = typeof rateLimitBuckets.$inferInsert;
