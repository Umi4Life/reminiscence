import type { Database } from "@queue-reminiscence/db";
import { adminAuditEvents } from "@queue-reminiscence/db/schema";

export type AdminAuditAction =
  | "org_create"
  | "org_update"
  | "org_delete"
  | "admin_create"
  | "admin_update"
  | "admin_password_reset"
  | "membership_assign"
  | "membership_revoke";

export interface AdminAuditEventInput {
  actorAdminUserId: string;
  action: AdminAuditAction;
  targetId: string;
  organizationId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AdminAuditLogService {
  record(event: AdminAuditEventInput): Promise<void>;
}

export function createDbAdminAuditLogService(db: Database): AdminAuditLogService {
  return {
    async record(event) {
      await db.insert(adminAuditEvents).values({
        actorAdminUserId: event.actorAdminUserId,
        action: event.action,
        targetId: event.targetId,
        organizationId: event.organizationId ?? null,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
      });
    },
  };
}

export function createNoopAdminAuditLogService(): AdminAuditLogService {
  return {
    async record() {},
  };
}
