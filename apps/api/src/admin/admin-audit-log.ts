import type { Database } from "@queue-reminiscence/db";
import { adminAuditEvents } from "@queue-reminiscence/db/schema";
import { and, desc, eq, inArray, lt } from "drizzle-orm";

import { canManagePlatform, getOwnedOrganizationIds, type AdminRbacContext } from "../auth/rbac";

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

export interface AdminAuditEventRecord {
  id: string;
  actorAdminUserId: string;
  action: AdminAuditAction;
  targetId: string;
  organizationId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AuditEventFilters {
  action?: AdminAuditAction;
  organizationId?: string;
  before?: Date;
  limit: number;
}

export type ListAuditEventsResult =
  | { status: "ok"; events: AdminAuditEventRecord[] }
  | { status: "forbidden" };

export interface AdminAuditLogService {
  record(event: AdminAuditEventInput): Promise<void>;
  listAuditEvents(
    rbac: AdminRbacContext,
    filters: AuditEventFilters,
  ): Promise<ListAuditEventsResult>;
}

const SENSITIVE_KEY = /password/i;

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!metadata) return null;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!SENSITIVE_KEY.test(key)) {
      sanitized[key] = value;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function sanitizeMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return sanitizeAuditMetadata(parsed as Record<string, unknown>);
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

    async listAuditEvents(rbac, filters): Promise<ListAuditEventsResult> {
      const isSuperAdmin = canManagePlatform(rbac);
      const ownedOrgIds = isSuperAdmin ? null : getOwnedOrganizationIds(rbac);

      if (!isSuperAdmin && ownedOrgIds!.length === 0) {
        return { status: "forbidden" };
      }

      const conditions = [];

      if (filters.action !== undefined) {
        conditions.push(eq(adminAuditEvents.action, filters.action));
      }

      if (filters.organizationId !== undefined) {
        if (ownedOrgIds !== null && !ownedOrgIds.includes(filters.organizationId)) {
          return { status: "forbidden" };
        }
        conditions.push(eq(adminAuditEvents.organizationId, filters.organizationId));
      } else if (ownedOrgIds !== null) {
        conditions.push(inArray(adminAuditEvents.organizationId, ownedOrgIds));
      }

      if (filters.before !== undefined) {
        conditions.push(lt(adminAuditEvents.createdAt, filters.before));
      }

      const rows = await db
        .select()
        .from(adminAuditEvents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(adminAuditEvents.createdAt))
        .limit(filters.limit);

      return {
        status: "ok",
        events: rows.map((row) => ({
          id: row.id,
          actorAdminUserId: row.actorAdminUserId,
          action: row.action as AdminAuditAction,
          targetId: row.targetId,
          organizationId: row.organizationId,
          metadata: sanitizeMetadata(row.metadata),
          createdAt: row.createdAt,
        })),
      };
    },
  };
}

export function createNoopAdminAuditLogService(): AdminAuditLogService {
  return {
    async record() {},
    async listAuditEvents() {
      return { status: "ok", events: [] };
    },
  };
}
