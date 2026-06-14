import type { AppConfig } from "@queue-reminiscence/config";
import type { Database } from "@queue-reminiscence/db";
import { boards, displayDevices, organizations, venues } from "@queue-reminiscence/db/schema";
import { and, eq } from "drizzle-orm";

import { hashOpaqueToken } from "../security/tokens";

export interface ResolvedDisplayDevice {
  id: string;
  boardId: string;
  name: string;
  status: "active" | "revoked";
  canViewPublicAccessPayload: boolean;
  lastSeenAt: Date | null;
  board: {
    id: string;
    publicSlug: string;
    name: string;
    status: "open" | "closed";
    displayVersion: number;
    updatedAt: Date;
  };
  venue: {
    id: string;
    name: string;
  };
  organization: {
    id: string;
    name: string;
  };
}

export interface DisplayDeviceResolver {
  resolveDevice(rawToken: string): Promise<ResolvedDisplayDevice | null>;
}

export function createDbDisplayDeviceResolver(
  db: Database,
  config: AppConfig,
): DisplayDeviceResolver {
  return {
    async resolveDevice(rawToken) {
      const tokenHash = hashOpaqueToken(rawToken, config.tokenHmacSecret);

      const [row] = await db
        .select({
          device: displayDevices,
          board: boards,
          venue: venues,
          organization: organizations,
        })
        .from(displayDevices)
        .innerJoin(boards, eq(displayDevices.boardId, boards.id))
        .innerJoin(venues, eq(boards.venueId, venues.id))
        .innerJoin(organizations, eq(venues.organizationId, organizations.id))
        .where(and(eq(displayDevices.tokenHash, tokenHash)))
        .limit(1);

      if (!row) {
        return null;
      }

      // Update lastSeenAt for active devices
      if (row.device.status === "active") {
        await db
          .update(displayDevices)
          .set({ lastSeenAt: new Date() })
          .where(eq(displayDevices.id, row.device.id));
      }

      return {
        id: row.device.id,
        boardId: row.device.boardId,
        name: row.device.name,
        status: row.device.status,
        canViewPublicAccessPayload: row.device.canViewPublicAccessPayload,
        lastSeenAt: row.device.lastSeenAt,
        board: {
          id: row.board.id,
          publicSlug: row.board.publicSlug,
          name: row.board.name,
          status: row.board.status,
          displayVersion: row.board.displayVersion,
          updatedAt: row.board.updatedAt,
        },
        venue: {
          id: row.venue.id,
          name: row.venue.name,
        },
        organization: {
          id: row.organization.id,
          name: row.organization.name,
        },
      };
    },
  };
}
