import type { AppConfig } from "@queue-reminiscence/config";
import type { Database } from "@queue-reminiscence/db";
import { boardAccessCredentials, queueEntries } from "@queue-reminiscence/db/schema";
import { and, asc, eq } from "drizzle-orm";

import { buildPublicAccessUrl, buildQrSvgUrl } from "../access/access-url";
import { decryptAccessCode } from "../access/credential-ciphertext";
import { derivePositions } from "../queue/read";
import type { ResolvedDisplayDevice } from "./display-devices";

export interface DisplayStatePayload {
  board: {
    publicSlug: string;
    name: string;
    venueName: string;
    organizationName: string;
    status: "open" | "closed";
  };
  queue: Array<{ position: number; displayName: string }>;
  queueLength: number;
  publicAccess: {
    url: string;
    qrSvgUrl: string;
    expiresAt: string | null;
    version: number;
  } | null;
  updatedAt: string;
  displayVersion: number;
}

export function buildDisplayEtag(displayVersion: number): string {
  return `"board-display-${displayVersion}"`;
}

export interface DisplayStateService {
  buildState(device: ResolvedDisplayDevice): Promise<DisplayStatePayload>;
}

export function createDbDisplayStateService(db: Database, config: AppConfig): DisplayStateService {
  return {
    async buildState(device) {
      const boardId = device.board.id;

      // Load active queue entries
      const activeEntries = await db
        .select({
          id: queueEntries.id,
          displayName: queueEntries.displayName,
          sortOrder: queueEntries.sortOrder,
          createdAt: queueEntries.createdAt,
        })
        .from(queueEntries)
        .where(and(eq(queueEntries.boardId, boardId), eq(queueEntries.status, "active")))
        .orderBy(asc(queueEntries.sortOrder));

      const positioned = derivePositions(activeEntries);
      const queue = positioned.map((entry) => ({
        position: entry.position,
        displayName: entry.displayName,
      }));

      // Build publicAccess payload
      let publicAccess: DisplayStatePayload["publicAccess"] = null;

      if (device.canViewPublicAccessPayload) {
        const [credential] = await db
          .select()
          .from(boardAccessCredentials)
          .where(
            and(
              eq(boardAccessCredentials.boardId, boardId),
              eq(boardAccessCredentials.status, "active"),
            ),
          )
          .limit(1);

        if (credential && credential.accessCodeCiphertext) {
          const accessCode = decryptAccessCode(
            credential.accessCodeCiphertext,
            config.tokenHmacSecret,
          );

          publicAccess = {
            url: buildPublicAccessUrl(config, accessCode),
            qrSvgUrl: buildQrSvgUrl(config, accessCode),
            expiresAt: credential.expiresAt ? credential.expiresAt.toISOString() : null,
            version: credential.version,
          };
        }
      }

      return {
        board: {
          publicSlug: device.board.publicSlug,
          name: device.board.name,
          venueName: device.venue.name,
          organizationName: device.organization.name,
          status: device.board.status,
        },
        queue,
        queueLength: queue.length,
        publicAccess,
        updatedAt: device.board.updatedAt.toISOString(),
        displayVersion: device.board.displayVersion,
      };
    },
  };
}
