CREATE TYPE "public"."admin_audit_action" AS ENUM('org_create', 'org_update', 'org_delete', 'admin_create', 'admin_update', 'admin_password_reset', 'membership_assign', 'membership_revoke');--> statement-breakpoint
CREATE TABLE "admin_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_admin_user_id" uuid NOT NULL,
	"action" "admin_audit_action" NOT NULL,
	"target_id" varchar(255) NOT NULL,
	"organization_id" uuid,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_actor_admin_user_id_admin_users_id_fk" FOREIGN KEY ("actor_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_events_actor_idx" ON "admin_audit_events" USING btree ("actor_admin_user_id");--> statement-breakpoint
CREATE INDEX "admin_audit_events_created_at_idx" ON "admin_audit_events" USING btree ("created_at" desc);