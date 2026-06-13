import { desc } from "drizzle-orm";
import {
  type AnyPgColumn,
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
