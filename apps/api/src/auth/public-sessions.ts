import type { AppConfig } from "@queue-reminiscence/config";
import type { BoardAccessCredential, Database, PublicBoardSession } from "@queue-reminiscence/db";
import { boardAccessCredentials, boards, publicBoardSessions } from "@queue-reminiscence/db/schema";
import { and, eq, gt, isNull, or } from "drizzle-orm";

import { generateOpaqueToken, hashOpaqueToken } from "../security/tokens";

export const PUBLIC_BOARD_SESSION_COOKIE_NAME = "qr_public_session";

export interface PublicBoardSessionContext {
  session: {
    id: string;
    boardId: string;
    credentialId: string;
    expiresAt: Date;
  };
  board: {
    id: string;
    publicSlug: string;
  };
}

export type ClaimPublicAccessResult =
  | {
      status: "claimed";
      token: string;
      expiresAt: Date;
      board: { id: string; publicSlug: string };
      mutationAccessExpiresAt: Date;
    }
  | {
      status: "expired" | "revoked";
      board: { id: string; publicSlug: string };
      message: string;
    }
  | { status: "invalid"; message: string };

export interface PublicSessionService {
  claimAccess(accessCode: string): Promise<ClaimPublicAccessResult>;
  resolveSession(token: string): Promise<PublicBoardSessionContext>;
  logout(token: string): Promise<void>;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function minDate(first: Date, second: Date): Date {
  return first.getTime() <= second.getTime() ? first : second;
}

function isCredentialExpired(
  credential: Pick<BoardAccessCredential, "expiresAt">,
  now: Date,
): boolean {
  return credential.expiresAt !== null && credential.expiresAt.getTime() <= now.getTime();
}

function inactiveCredentialResult(
  status: "expired" | "revoked",
  board: { id: string; publicSlug: string },
): ClaimPublicAccessResult {
  return {
    status,
    board,
    message: "This queue link is no longer active for editing.",
  };
}

function invalidCredentialResult(): ClaimPublicAccessResult {
  return {
    status: "invalid",
    message: "This queue link is not valid.",
  };
}

function sessionExpiryFor(
  config: AppConfig,
  credential: Pick<BoardAccessCredential, "expiresAt">,
  now: Date,
): Date {
  const ttlExpiry = addHours(now, config.publicMutationSessionTtlHours);
  return credential.expiresAt ? minDate(ttlExpiry, credential.expiresAt) : ttlExpiry;
}

function toSessionContext(
  session: PublicBoardSession,
  board: { id: string; publicSlug: string },
): PublicBoardSessionContext {
  return {
    session: {
      id: session.id,
      boardId: session.boardId,
      credentialId: session.credentialId,
      expiresAt: session.expiresAt,
    },
    board,
  };
}

export function createDbPublicSessionService(
  db: Database,
  config: AppConfig,
): PublicSessionService {
  return {
    async claimAccess(accessCode) {
      const tokenHash = hashOpaqueToken(accessCode, config.tokenHmacSecret);
      const now = new Date();
      const [row] = await db
        .select({ credential: boardAccessCredentials, board: boards })
        .from(boardAccessCredentials)
        .innerJoin(boards, eq(boardAccessCredentials.boardId, boards.id))
        .where(eq(boardAccessCredentials.tokenHash, tokenHash))
        .limit(1);

      if (!row) {
        return invalidCredentialResult();
      }

      const board = { id: row.board.id, publicSlug: row.board.publicSlug };

      if (row.credential.status === "revoked") {
        return inactiveCredentialResult("revoked", board);
      }

      if (row.credential.status === "expired" || isCredentialExpired(row.credential, now)) {
        return inactiveCredentialResult("expired", board);
      }

      const sessionToken = generateOpaqueToken();
      const sessionTokenHash = hashOpaqueToken(sessionToken, config.tokenHmacSecret);
      const expiresAt = sessionExpiryFor(config, row.credential, now);

      await db.insert(publicBoardSessions).values({
        boardId: row.board.id,
        credentialId: row.credential.id,
        tokenHash: sessionTokenHash,
        status: "active",
        expiresAt,
        lastSeenAt: now,
      });

      return {
        status: "claimed",
        token: sessionToken,
        expiresAt,
        board,
        mutationAccessExpiresAt: expiresAt,
      };
    },

    async resolveSession(token) {
      const tokenHash = hashOpaqueToken(token, config.tokenHmacSecret);
      const now = new Date();
      const [row] = await db
        .select({ session: publicBoardSessions, credential: boardAccessCredentials, board: boards })
        .from(publicBoardSessions)
        .innerJoin(
          boardAccessCredentials,
          eq(publicBoardSessions.credentialId, boardAccessCredentials.id),
        )
        .innerJoin(boards, eq(publicBoardSessions.boardId, boards.id))
        .where(
          and(
            eq(publicBoardSessions.tokenHash, tokenHash),
            eq(publicBoardSessions.status, "active"),
            gt(publicBoardSessions.expiresAt, now),
            eq(boardAccessCredentials.status, "active"),
            or(isNull(boardAccessCredentials.expiresAt), gt(boardAccessCredentials.expiresAt, now)),
          ),
        )
        .limit(1);

      if (!row) {
        throw new Error("Public board session is not active.");
      }

      await db
        .update(publicBoardSessions)
        .set({ lastSeenAt: now })
        .where(eq(publicBoardSessions.id, row.session.id));

      return toSessionContext(row.session, { id: row.board.id, publicSlug: row.board.publicSlug });
    },

    async logout(token) {
      const tokenHash = hashOpaqueToken(token, config.tokenHmacSecret);

      await db
        .update(publicBoardSessions)
        .set({ status: "revoked" })
        .where(
          and(
            eq(publicBoardSessions.tokenHash, tokenHash),
            eq(publicBoardSessions.status, "active"),
          ),
        );
    },
  };
}
