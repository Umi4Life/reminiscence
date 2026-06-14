import type { AppConfig } from "@queue-reminiscence/config";
import type { Board, BoardAccessCredential, Database, DbTransaction } from "@queue-reminiscence/db";
import {
  boardAccessCredentials,
  boardEvents,
  boards,
  publicBoardSessions,
} from "@queue-reminiscence/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { assertCanOperateBoard, type AdminRbacContext } from "../auth/rbac";
import { toBoardSummaryFromRow, type BoardSummary } from "../admin/board-management";
import { loadBoardWithResourceContext, lockBoardRow } from "../boards/board-context";
import { createTokenPreview, generateOpaqueToken, hashOpaqueToken } from "../security/tokens";

export interface RotatedBoardAccessCredential {
  id: string;
  accessUrl: string;
  tokenPreview: string;
  version: number;
  expiresAt: Date | null;
}

export type RotateBoardAccessResult =
  | {
      status: "rotated";
      board: BoardSummary;
      credential: RotatedBoardAccessCredential;
    }
  | { status: "not_found" };

export interface BoardAccessService {
  rotateBoardAccessCredential(
    rbac: AdminRbacContext,
    adminUserId: string,
    boardId: string,
  ): Promise<RotateBoardAccessResult>;
}

function accessUrlFor(config: AppConfig, accessCode: string): string {
  return new URL(`/q/${accessCode}`, config.publicAppUrl).toString();
}

async function revokeActiveCredentials(
  tx: DbTransaction,
  boardId: string,
  adminUserId: string,
  now: Date,
): Promise<BoardAccessCredential[]> {
  return tx
    .update(boardAccessCredentials)
    .set({
      status: "revoked",
      revokedAt: now,
      revokedByAdminUserId: adminUserId,
    })
    .where(
      and(eq(boardAccessCredentials.boardId, boardId), eq(boardAccessCredentials.status, "active")),
    )
    .returning();
}

async function revokeSessionsForCredentials(
  tx: DbTransaction,
  credentialIds: string[],
): Promise<void> {
  if (credentialIds.length === 0) {
    return;
  }

  await tx
    .update(publicBoardSessions)
    .set({ status: "revoked" })
    .where(
      and(
        inArray(publicBoardSessions.credentialId, credentialIds),
        eq(publicBoardSessions.status, "active"),
      ),
    );
}

async function nextCredentialVersion(tx: DbTransaction, boardId: string): Promise<number> {
  const [latest] = await tx
    .select({ version: boardAccessCredentials.version })
    .from(boardAccessCredentials)
    .where(eq(boardAccessCredentials.boardId, boardId))
    .orderBy(desc(boardAccessCredentials.version))
    .limit(1);

  return (latest?.version ?? 0) + 1;
}

async function incrementDisplayVersion(tx: DbTransaction, boardId: string): Promise<Board> {
  const [board] = await tx
    .update(boards)
    .set({ displayVersion: sql`${boards.displayVersion} + 1` })
    .where(eq(boards.id, boardId))
    .returning();

  if (!board) {
    throw new Error(`Board ${boardId} disappeared during access rotation`);
  }

  return board;
}

export function createDbBoardAccessService(db: Database, config: AppConfig): BoardAccessService {
  return {
    async rotateBoardAccessCredential(rbac, adminUserId, boardId) {
      const context = await loadBoardWithResourceContext(db, boardId);

      if (!context) {
        return { status: "not_found" };
      }

      assertCanOperateBoard(rbac, context);

      const accessCode = generateOpaqueToken();
      const tokenHash = hashOpaqueToken(accessCode, config.tokenHmacSecret);
      const tokenPreview = createTokenPreview(accessCode);
      const now = new Date();

      const mutation = await db.transaction(async (tx) => {
        const locked = await lockBoardRow(tx, boardId);

        if (!locked) {
          throw new Error(`Board ${boardId} not found during access rotation`);
        }

        const revokedCredentials = await revokeActiveCredentials(tx, boardId, adminUserId, now);
        await revokeSessionsForCredentials(
          tx,
          revokedCredentials.map((credential) => credential.id),
        );

        const version = await nextCredentialVersion(tx, boardId);
        const [credential] = await tx
          .insert(boardAccessCredentials)
          .values({
            boardId,
            tokenHash,
            tokenPreview,
            version,
            status: "active",
            expiresAt: null,
            createdByAdminUserId: adminUserId,
          })
          .returning();

        await tx.insert(boardEvents).values({
          boardId,
          actorType: "admin",
          actorAdminUserId: adminUserId,
          type: "access_rotated",
          publicMessage: "Public QR access was rotated by staff.",
        });

        const board = await incrementDisplayVersion(tx, boardId);

        return { board, credential };
      });

      return {
        status: "rotated",
        board: toBoardSummaryFromRow(mutation.board, context.organizationId),
        credential: {
          id: mutation.credential.id,
          accessUrl: accessUrlFor(config, accessCode),
          tokenPreview: mutation.credential.tokenPreview,
          version: mutation.credential.version,
          expiresAt: mutation.credential.expiresAt,
        },
      };
    },
  };
}
