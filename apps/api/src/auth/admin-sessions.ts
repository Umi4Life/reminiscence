import type { AppConfig } from "@queue-reminiscence/config";
import type { AdminMembership, AdminUser, Database } from "@queue-reminiscence/db";
import { adminMemberships, adminSessions, adminUsers } from "@queue-reminiscence/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";

import { unauthorizedError } from "../http/errors";
import { hashPassword, verifyPassword } from "./passwords";
import { generateSessionToken, hashSessionToken } from "../security/session-tokens";

/**
 * A real Argon2id hash used to equalize login timing when the email does not
 * resolve to an active admin. Without this, a missing email returns before any
 * hashing work while a real email pays the full Argon2id cost, leaking account
 * existence by timing. We verify the supplied password against this dummy hash
 * so both paths perform equivalent work. Computed once and cached.
 */
let dummyPasswordHashPromise: Promise<string> | null = null;

function getDummyPasswordHash(): Promise<string> {
  if (!dummyPasswordHashPromise) {
    dummyPasswordHashPromise = hashPassword("timing-equalization-placeholder");
  }

  return dummyPasswordHashPromise;
}

export const ADMIN_SESSION_COOKIE_NAME = "qr_admin_session";

export interface AdminIdentity {
  id: string;
  email: string;
  displayName: string;
}

export interface AdminMembershipSummary {
  id: string;
  organizationId: string;
  venueId: string | null;
  role: AdminMembership["role"];
}

export interface AdminSessionContext {
  admin: AdminIdentity;
  memberships: AdminMembershipSummary[];
}

export interface LoginResult extends AdminSessionContext {
  token: string;
  expiresAt: Date;
}

export interface AdminAuthService {
  login(email: string, password: string): Promise<LoginResult>;
  resolve(token: string): Promise<AdminSessionContext>;
  logout(token: string): Promise<void>;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toAdminIdentity(admin: AdminUser): AdminIdentity {
  return {
    id: admin.id,
    email: admin.email,
    displayName: admin.displayName,
  };
}

function toMembershipSummary(membership: AdminMembership): AdminMembershipSummary {
  return {
    id: membership.id,
    organizationId: membership.organizationId,
    venueId: membership.venueId,
    role: membership.role,
  };
}

export async function loadAdminMemberships(
  db: Database,
  adminUserId: string,
): Promise<AdminMembershipSummary[]> {
  const memberships = await db
    .select()
    .from(adminMemberships)
    .where(eq(adminMemberships.adminUserId, adminUserId));

  return memberships.map(toMembershipSummary);
}

export function createDbAdminAuthService(db: Database, config: AppConfig): AdminAuthService {
  async function loadActiveAdminByEmail(email: string): Promise<AdminUser | undefined> {
    const [admin] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, normalizeEmail(email)))
      .limit(1);

    if (!admin || admin.status !== "active") {
      return undefined;
    }

    return admin;
  }

  return {
    async login(email: string, password: string): Promise<LoginResult> {
      const admin = await loadActiveAdminByEmail(email);

      if (!admin) {
        // Perform an equivalent Argon2id verification against a dummy hash so
        // that a missing account is indistinguishable by timing from a wrong
        // password on a real account.
        await verifyPassword(password, await getDummyPasswordHash());
        throw unauthorizedError("Invalid email or password.");
      }

      const passwordMatches = await verifyPassword(password, admin.passwordHash);

      if (!passwordMatches) {
        throw unauthorizedError("Invalid email or password.");
      }

      const token = generateSessionToken();
      const tokenHash = hashSessionToken(token, config.sessionSecret);
      const now = new Date();
      const expiresAt = addDays(now, config.adminSessionTtlDays);

      await db.insert(adminSessions).values({
        adminUserId: admin.id,
        tokenHash,
        expiresAt,
        lastSeenAt: now,
      });

      await db.update(adminUsers).set({ lastLoginAt: now }).where(eq(adminUsers.id, admin.id));

      return {
        admin: toAdminIdentity(admin),
        memberships: await loadAdminMemberships(db, admin.id),
        token,
        expiresAt,
      };
    },

    async resolve(token: string): Promise<AdminSessionContext> {
      const tokenHash = hashSessionToken(token, config.sessionSecret);
      const now = new Date();

      const [row] = await db
        .select({ session: adminSessions, admin: adminUsers })
        .from(adminSessions)
        .innerJoin(adminUsers, eq(adminSessions.adminUserId, adminUsers.id))
        .where(
          and(
            eq(adminSessions.tokenHash, tokenHash),
            isNull(adminSessions.revokedAt),
            gt(adminSessions.expiresAt, now),
            eq(adminUsers.status, "active"),
          ),
        )
        .limit(1);

      if (!row) {
        throw unauthorizedError();
      }

      await db
        .update(adminSessions)
        .set({ lastSeenAt: now })
        .where(eq(adminSessions.id, row.session.id));

      return {
        admin: toAdminIdentity(row.admin),
        memberships: await loadAdminMemberships(db, row.admin.id),
      };
    },

    async logout(token: string): Promise<void> {
      const tokenHash = hashSessionToken(token, config.sessionSecret);

      await db
        .update(adminSessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(adminSessions.tokenHash, tokenHash), isNull(adminSessions.revokedAt)));
    },
  };
}
