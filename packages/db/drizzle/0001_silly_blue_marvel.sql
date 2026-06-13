CREATE TYPE "public"."board_event_actor_type" AS ENUM('public', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."board_event_type" AS ENUM('entry_added', 'entry_removed', 'entry_restored', 'board_reset', 'board_opened', 'board_closed', 'access_rotated');--> statement-breakpoint
CREATE TYPE "public"."queue_entry_status" AS ENUM('active', 'removed');--> statement-breakpoint
CREATE TABLE "audit_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"ip_hash" varchar(64),
	"user_agent_hash" varchar(64),
	"public_session_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"actor_type" "board_event_actor_type" NOT NULL,
	"actor_admin_user_id" uuid,
	"type" "board_event_type" NOT NULL,
	"entry_id" uuid,
	"display_name_snapshot" varchar(40),
	"public_message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"display_name" varchar(40) NOT NULL,
	"sort_order" integer NOT NULL,
	"status" "queue_entry_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by_event_id" uuid
);
--> statement-breakpoint
ALTER TABLE "audit_metadata" ADD CONSTRAINT "audit_metadata_event_id_board_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."board_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_events" ADD CONSTRAINT "board_events_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_events" ADD CONSTRAINT "board_events_entry_id_queue_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."queue_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_removed_by_event_id_board_events_id_fk" FOREIGN KEY ("removed_by_event_id") REFERENCES "public"."board_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_metadata_event_id_idx" ON "audit_metadata" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "board_events_board_id_created_at_idx" ON "board_events" USING btree ("board_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "queue_entries_board_status_sort_order_idx" ON "queue_entries" USING btree ("board_id","status","sort_order");