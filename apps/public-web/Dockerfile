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

# Shared CSS package — imported by the app's root +layout.svelte and bundled
# by Vite at build time, so its source must be present here (not just its manifest).
COPY packages/ui ./packages/ui
COPY apps/public-web ./apps/public-web

# GCP_BUILDPACKS triggers adapter-auto to select @sveltejs/adapter-node
ENV GCP_BUILDPACKS=1
RUN bun run --cwd apps/public-web build

# ── Stage 2: runtime ─────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/apps/public-web/build ./build

ENV PORT=3000
EXPOSE 3000

# PUBLIC_API_BASE_URL defaults to http://localhost:3002/api in public-web
# Set PUBLIC_API_BASE_URL and ORIGIN at runtime for production use
CMD ["node", "build/index.js"]
