import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import { adminMemberships, adminUsers, boards, organizations, venues } from "./schema";

const ORG_SLUG = "umi4life-demo";
const ORG_NAME = "Umi4Life Demo";
const VENUE_SLUG = "local-demo-venue";
const VENUE_NAME = "Local Demo Venue";
const VENUE_TIMEZONE = "Asia/Bangkok";
const BOARD_SLUG = "chunithm-gold";
const BOARD_PUBLIC_SLUG = "local-demo-venue-chunithm-gold";
const BOARD_NAME = "CHUNITHM Gold";

function loadRepoEnvFile(): void {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(packageDir, "../../../.env");

  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key.length > 0 && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

type BunPasswordHasher = {
  hash(
    password: string,
    options: {
      algorithm: "argon2id";
      memoryCost: number;
      timeCost: number;
    },
  ): Promise<string>;
};

function getBunPasswordHasher(): BunPasswordHasher {
  const bun = (globalThis as { Bun?: { password: BunPasswordHasher } }).Bun;

  if (!bun) {
    throw new Error("Bun runtime is required to hash seed admin passwords");
  }

  return bun.password;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }

  return value;
}

async function hashPassword(password: string): Promise<string> {
  return getBunPasswordHasher().hash(password, {
    algorithm: "argon2id",
    memoryCost: 19456,
    timeCost: 2,
  });
}

async function seedDemoData() {
  loadRepoEnvFile();

  const databaseUrl = requireEnv("DATABASE_URL");
  const adminEmail = requireEnv("SEED_ADMIN_EMAIL");
  const adminPassword = requireEnv("SEED_ADMIN_PASSWORD");
  // Only promotes the configured seeded admin email. Idempotent.
  // Set intentionally for bootstrap only; leave unset or false in production.
  const seedSuperAdmin = process.env["SEED_SUPER_ADMIN"]?.trim().toLowerCase() !== "false";

  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });

  try {
    const [existingOrganization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, ORG_SLUG))
      .limit(1);

    let organization = existingOrganization;

    if (!organization) {
      const [created] = await db
        .insert(organizations)
        .values({
          slug: ORG_SLUG,
          name: ORG_NAME,
        })
        .returning();
      organization = created;
      console.log(`Created organization: ${ORG_SLUG}`);
    } else {
      console.log(`Organization already exists: ${ORG_SLUG}`);
    }

    const [existingVenue] = await db
      .select()
      .from(venues)
      .where(and(eq(venues.organizationId, organization.id), eq(venues.slug, VENUE_SLUG)))
      .limit(1);

    let venue = existingVenue;

    if (!venue) {
      const [created] = await db
        .insert(venues)
        .values({
          organizationId: organization.id,
          slug: VENUE_SLUG,
          name: VENUE_NAME,
          timezone: VENUE_TIMEZONE,
        })
        .returning();
      venue = created;
      console.log(`Created venue: ${VENUE_SLUG}`);
    } else {
      console.log(`Venue already exists: ${VENUE_SLUG}`);
    }

    const [existingBoard] = await db
      .select()
      .from(boards)
      .where(and(eq(boards.venueId, venue.id), eq(boards.slug, BOARD_SLUG)))
      .limit(1);

    let board = existingBoard;

    if (!board) {
      const [created] = await db
        .insert(boards)
        .values({
          venueId: venue.id,
          slug: BOARD_SLUG,
          publicSlug: BOARD_PUBLIC_SLUG,
          name: BOARD_NAME,
          status: "closed",
          publicViewPolicy: "open",
          publicAddPolicy: "access_code_required",
          publicRemovePolicy: "access_code_required",
          qrRotationPolicy: "manual",
        })
        .returning();
      board = created;
      console.log(`Created board: ${BOARD_SLUG}`);
    } else {
      console.log(`Board already exists: ${BOARD_SLUG}`);
    }

    const [existingAdminUser] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, adminEmail))
      .limit(1);

    let adminUser = existingAdminUser;

    if (!adminUser) {
      const passwordHash = await hashPassword(adminPassword);
      const [created] = await db
        .insert(adminUsers)
        .values({
          email: adminEmail,
          displayName: "Demo Admin",
          passwordHash,
          status: "active",
          isSuperAdmin: seedSuperAdmin,
        })
        .returning();
      adminUser = created;
      console.log(`Created admin user: ${adminEmail}`);
    } else {
      console.log(`Admin user already exists: ${adminEmail}`);

      if (seedSuperAdmin && !adminUser.isSuperAdmin) {
        await db
          .update(adminUsers)
          .set({ isSuperAdmin: true })
          .where(eq(adminUsers.id, adminUser.id));
        adminUser = { ...adminUser, isSuperAdmin: true };
        console.log(`Promoted admin user to super-admin: ${adminEmail}`);
      }
    }

    const [existingMembership] = await db
      .select()
      .from(adminMemberships)
      .where(
        and(
          eq(adminMemberships.adminUserId, adminUser.id),
          eq(adminMemberships.organizationId, organization.id),
          isNull(adminMemberships.venueId),
        ),
      )
      .limit(1);

    if (!existingMembership) {
      await db.insert(adminMemberships).values({
        adminUserId: adminUser.id,
        organizationId: organization.id,
        venueId: null,
        role: "org_owner",
      });
      console.log(`Created org_owner membership for: ${adminEmail}`);
    } else {
      console.log(`Org owner membership already exists for: ${adminEmail}`);
    }

    console.log("Seed complete.");
    console.log(
      JSON.stringify(
        {
          organization: { slug: ORG_SLUG, id: organization.id },
          venue: { slug: VENUE_SLUG, id: venue.id },
          board: { slug: BOARD_SLUG, publicSlug: board.publicSlug, id: board.id },
          admin: { email: adminEmail, id: adminUser.id },
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

seedDemoData().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
