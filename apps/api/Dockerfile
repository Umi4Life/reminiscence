# syntax=docker/dockerfile:1

# ── Stage 1: install workspace deps ──────────────────────────────────
FROM oven/bun:1.2.23-alpine AS deps
WORKDIR /app

# Bring in all workspace manifests so bun can resolve the full dep graph
COPY package.json bun.lock ./
COPY apps/api/package.json        ./apps/api/
COPY apps/admin-web/package.json  ./apps/admin-web/
COPY apps/public-web/package.json ./apps/public-web/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json     ./packages/db/
COPY packages/domain/package.json ./packages/domain/
COPY packages/ui/package.json     ./packages/ui/

# Install all deps (including devDeps — drizzle-kit is needed for migrations)
RUN bun install --frozen-lockfile

# ── Stage 2: runtime ─────────────────────────────────────────────────
FROM oven/bun:1.2.23-alpine
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

# Workspace package sources (node_modules symlinks resolve here at runtime)
COPY packages/config  ./packages/config
COPY packages/db      ./packages/db
COPY packages/domain  ./packages/domain
COPY packages/ui      ./packages/ui

COPY apps/api ./apps/api

EXPOSE 3002

# Apply any pending migrations then start the server.
# DATABASE_URL and other required env vars must be provided at runtime.
CMD ["sh", "-c", "bun run --cwd packages/db db:migrate && exec bun run apps/api/src/index.ts"]
