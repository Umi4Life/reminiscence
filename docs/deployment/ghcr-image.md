# Deploy from the GHCR Image

Run Reminiscence from the prebuilt container image published to the GitHub
Container Registry (GHCR) — no local build, no source checkout required on the
host.

- **Image:** [`ghcr.io/umi4life/reminiscence`](https://github.com/Umi4Life/reminiscence/pkgs/container/reminiscence)
- **Compose file:** [`docker-compose.ghcr.yml`](../../docker-compose.ghcr.yml) — registry-based, Postgres bundled.

> **One image, three apps.** The same image runs all three processes. The `APP`
> environment variable (`api`, `admin-web`, or `public-web`) selects which one
> starts; the `api` process also applies DB migrations on boot. It seeds the
> first admin only when `RUN_SEED=true`. See [`docker-entrypoint.sh`](../../docker-entrypoint.sh).

---

## Image Tags

| Tag           | Meaning                                     | Use for                       |
| ------------- | ------------------------------------------- | ----------------------------- |
| `:latest`     | Latest **stable release** (newest `vX.Y.Z`) | Production, default           |
| `:1.2.3`      | Exact release — immutable                   | Pinned production             |
| `:1.2` / `:1` | Floating minor / major                      | Auto-pick patch / minor       |
| `:edge`       | Latest `main` build — **unstable**          | Previewing unreleased changes |
| `:<git-sha>`  | Exact commit build — immutable              | Reproducing a specific build  |

> **Pin in production.** `:latest` and `:1.2` move under you. Pin a full
> `:1.2.3` (or `:<git-sha>`) for reproducible deploys and predictable upgrades.

> **Channels.** `:latest` tracks tagged releases; `:edge` tracks every merge to
> `main`. Don't run `:edge` in production — it's the unstable channel. See
> [Release strategy](#release-strategy-stable-vs-unstable) below.

---

## Prerequisites

| Requirement                 | Notes                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------- |
| Docker ≥ 24                 | With the Compose plugin (`docker compose version`)                                     |
| The repo's compose + `.env` | Only `docker-compose.ghcr.yml` and `.env` are needed on the host — not the full source |

The image is **public**, so no registry login is required to pull it. (For a
private package, see [Authenticating](#authenticating-to-ghcr-private-package).)

---

## Quick Start (single host, bundled Postgres)

```bash
# 1. Fetch only the two files you need onto the host
curl -O https://raw.githubusercontent.com/Umi4Life/reminiscence/main/docker-compose.ghcr.yml
curl -O https://raw.githubusercontent.com/Umi4Life/reminiscence/main/.env.example
mv .env.example .env

# 2. Configure — set the three *_SECRET values, seed admin, and RUN_SEED=true for bootstrap
$EDITOR .env

# 3. Choose a tag and start the stack
export REMINISCENCE_TAG=latest          # or 1.2.3, or edge
docker compose -f docker-compose.ghcr.yml up -d
```

This starts four containers:

| Container     | Port | `APP`        | Description                  |
| ------------- | ---- | ------------ | ---------------------------- |
| `qr-postgres` | —    | —            | PostgreSQL 16 (internal)     |
| `qr-api`      | 3002 | `api`        | Bun + Elysia API (+ migrate) |
| `qr-admin`    | 3001 | `admin-web`  | SvelteKit admin app          |
| `qr-display`  | 3000 | `public-web` | SvelteKit public/display app |

The `api` container runs migrations automatically. To bootstrap the first admin
and demo org/venue/board, set `RUN_SEED=true` together with
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` before starting the API container.
The seed is **idempotent**, but leave `RUN_SEED=false` after bootstrap so deleted
demo records are not recreated on every restart.

Open <http://localhost:3001> and sign in with your seed admin credentials.

> **Exact-origin rule.** `PUBLIC_APP_URL` must exactly match the origin the
> display app is served from (e.g. `http://localhost:3000`), or public session
> cookies and CORS break.

---

## Environment Configuration

`docker-compose.ghcr.yml` reads all config from `.env` (`env_file`) and sets
only the per-process `APP` and browser-facing API URL on top. The full variable
reference lives in
[`local-development.md`](local-development.md#environment-variables); the key
groups are:

| Group                    | Variables                                                                      |
| ------------------------ | ------------------------------------------------------------------------------ |
| **Database**             | `DATABASE_URL` (overridden to the bundled Postgres by the compose)             |
| **Origins (API CORS)**   | `PUBLIC_APP_URL`, `ADMIN_APP_URL`, `API_PUBLIC_BASE_URL`, `API_ADMIN_BASE_URL` |
| **Secrets** (≥ 32 chars) | `SESSION_SECRET`, `TOKEN_HMAC_SECRET`, `RATE_LIMIT_HMAC_SECRET`                |
| **Proxy**                | `TRUST_PROXY` (`true` behind a TLS-terminating proxy)                          |
| **Seed (bootstrap)**     | `RUN_SEED=true`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`                     |

> Two API-URL families, by design: the **API** reads `API_PUBLIC_BASE_URL` /
> `API_ADMIN_BASE_URL` (its CORS allowlist), while the **web apps** read
> `PUBLIC_API_BASE_URL` (the URL the browser calls). The compose maps the right
> one to each web container for you.

Generate secrets:

```bash
openssl rand -hex 32   # once per *_SECRET
```

### Bring your own Postgres

To use an external database, delete the `postgres` service (and the `depends_on`
blocks referencing it) from `docker-compose.ghcr.yml`, then set `DATABASE_URL`
in `.env` to your server's DSN. For a homelab setup with external Postgres **and**
a Traefik reverse proxy, follow
[`homelab-traefik-postgres.md`](homelab-traefik-postgres.md) — swap its `build:`
blocks for `image: ghcr.io/umi4life/reminiscence:<tag>` and add `APP:` per
service exactly as this compose file does.

---

## Health Checks

```bash
curl http://localhost:3002/healthz   # {"ok":true}            — process is up
curl http://localhost:3002/readyz    # {"ok":true} or error   — DB reachable
```

---

## Upgrades

```bash
# 1. Move the tag (or edit REMINISCENCE_TAG to a new pinned version)
export REMINISCENCE_TAG=1.3.0

# 2. Pull the new image
docker compose -f docker-compose.ghcr.yml pull

# 3. Recreate — the api container applies any new migrations on boot
docker compose -f docker-compose.ghcr.yml up -d
```

Roll back by setting `REMINISCENCE_TAG` to the previous version and repeating.
Note that migrations are forward-only — roll back the **image**, but verify the
schema is compatible before downgrading across a migration boundary.

---

## Authenticating to GHCR (private package)

Only needed if the package is made private. Create a GitHub Personal Access
Token with the `read:packages` scope, then:

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u <github-username> --password-stdin
```

After login, `docker compose -f docker-compose.ghcr.yml pull` works as above.

---

## Release Strategy: Stable vs Unstable

> **Recommendation:** publish `main` merges as an **unstable** channel and
> reserve `:latest` for tagged releases.

The repo runs two publish paths:

| Trigger             | Workflow                                             | Tags pushed                       | Channel  |
| ------------------- | ---------------------------------------------------- | --------------------------------- | -------- |
| Merge to `main`     | [`ci.yml`](../../.github/workflows/ci.yml)           | `:edge`, `:<git-sha>`             | Unstable |
| Push a `vX.Y.Z` tag | [`release.yml`](../../.github/workflows/release.yml) | `:X.Y.Z`, `:X.Y`, `:X`, `:latest` | Stable   |

This keeps the channels clean:

- **`:latest` always means "newest stable release."** Production can follow it,
  or pin a `:X.Y.Z`.
- **`:edge` always means "latest `main`."** Use it to preview unreleased work
  without ever clobbering what production pulls.
- **`:<git-sha>` and `:X.Y.Z` are immutable** — the audit trail for "what is
  actually running."

The alternative — pushing `:latest` from _every_ `main` merge — means `:latest`
is whatever happened to run last (a merge or a release, racing each other), so a
homelab `docker compose pull` can silently jump onto unreleased code. Splitting
the channels removes that ambiguity for the cost of one tag name (`:edge`).

**Cutting a release:**

```bash
git tag v1.3.0
git push origin v1.3.0     # release.yml builds and publishes the stable tags
```

> Until the first `vX.Y.Z` tag is cut, `:latest` does not exist yet — deploy
> `:edge` (or a `:<git-sha>`) in the meantime.
