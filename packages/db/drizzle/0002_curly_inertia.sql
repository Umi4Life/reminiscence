CREATE TYPE "public"."admin_membership_role" AS ENUM('org_owner', 'venue_manager', 'venue_staff');--> statement-breakpoint
CREATE TYPE "public"."admin_user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."board_access_credential_status" AS ENUM('active', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."display_device_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."public_board_session_status" AS ENUM('active', 'expired', 'revoked');--> statement-breakpoint
CREATE TABLE "admin_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"venue_id" uuid,
	"role" "admin_membership_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"status" "admin_user_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "board_access_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_preview" varchar(32) NOT NULL,
	"version" integer NOT NULL,
	"status" "board_access_credential_status" NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by_admin_user_id" uuid,
	"revoked_by_admin_user_id" uuid,
	CONSTRAINT "board_access_credentials_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "display_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"token_hash" text NOT NULL,
	"status" "display_device_status" NOT NULL,
	"can_view_public_access_payload" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "display_devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "public_board_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"credential_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" "public_board_session_status" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(64) NOT NULL,
	"bucket_key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_buckets_scope_bucket_window_unique" UNIQUE("scope","bucket_key","window_start")
);
--> statement-breakpoint
ALTER TABLE "admin_memberships" ADD CONSTRAINT "admin_memberships_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_memberships" ADD CONSTRAINT "admin_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_memberships" ADD CONSTRAINT "admin_memberships_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_access_credentials" ADD CONSTRAINT "board_access_credentials_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_access_credentials" ADD CONSTRAINT "board_access_credentials_created_by_admin_fk" FOREIGN KEY ("created_by_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_access_credentials" ADD CONSTRAINT "board_access_credentials_revoked_by_admin_fk" FOREIGN KEY ("revoked_by_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "display_devices" ADD CONSTRAINT "display_devices_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_board_sessions" ADD CONSTRAINT "public_board_sessions_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_board_sessions" ADD CONSTRAINT "public_board_sessions_credential_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."board_access_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_memberships_organization_id_idx" ON "admin_memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "admin_memberships_venue_id_idx" ON "admin_memberships" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "admin_memberships_admin_user_id_idx" ON "admin_memberships" USING btree ("admin_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_memberships_org_level_unique" ON "admin_memberships" USING btree ("admin_user_id","organization_id") WHERE "admin_memberships"."venue_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_memberships_venue_level_unique" ON "admin_memberships" USING btree ("admin_user_id","organization_id","venue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_hash_unique" ON "admin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_user_id_idx" ON "admin_sessions" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "board_access_credentials_board_status_version_idx" ON "board_access_credentials" USING btree ("board_id","status","version");--> statement-breakpoint
CREATE INDEX "display_devices_board_status_idx" ON "display_devices" USING btree ("board_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "public_board_sessions_token_hash_unique" ON "public_board_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "public_board_sessions_board_status_idx" ON "public_board_sessions" USING btree ("board_id","status");--> statement-breakpoint
CREATE INDEX "public_board_sessions_credential_id_idx" ON "public_board_sessions" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expires_at_idx" ON "rate_limit_buckets" USING btree ("expires_at");