# syntax=docker/dockerfile:1

# ── Stage 1: build ───────────────────────────────────────────────────
FROM oven/bun:1.2.23-alpine AS builder
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

RUN bun install --frozen-lockfile

COPY apps/admin-web ./apps/admin-web

# GCP_BUILDPACKS triggers adapter-auto to select @sveltejs/adapter-node
ENV GCP_BUILDPACKS=1
RUN bun run --cwd apps/admin-web build

# ── Stage 2: runtime ─────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/apps/admin-web/build ./build

ENV PORT=3001
EXPOSE 3001

# PUBLIC_API_BASE_URL defaults to /api (reverse-proxy path in prod)
# PUBLIC_APP_URL and ORIGIN must be set at runtime for CSRF + cookie correctness
CMD ["node", "build/index.js"]
