# Homelab Deployment — External Postgres + Traefik

This guide covers deploying Queue Reminiscence on a self-hosted Linux machine with:

- **External PostgreSQL** managed by your homelab (Postgres does not run in this compose stack).
- **External Traefik** as the reverse proxy/TLS terminator (Traefik does not run in this compose stack).

> **Compose file:** `docker-compose.homelab.yml` (app-only overlay) is delivered in PR #40.  
> Reference this contract now; amend filenames/labels after PR #40 merges.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Docker ≥ 24 | With Compose plugin |
| Traefik ≥ 2.x running on the host | Listening on 80/443, watching `docker` provider |
| PostgreSQL ≥ 15 on the host or network | Accessible from Docker containers |
| A dedicated Postgres database and user | See [Database Setup](#database-setup) |
| DNS records pointing to the three app hostnames | Or wildcard DNS |

---

## Database Setup

On your Postgres server:

```sql
CREATE USER queue_reminiscence WITH PASSWORD 'change-me';
CREATE DATABASE queue_reminiscence OWNER queue_reminiscence;
GRANT ALL PRIVILEGES ON DATABASE queue_reminiscence TO queue_reminiscence;
```

The `DATABASE_URL` in your `.env` will be:

```
DATABASE_URL=postgres://queue_reminiscence:change-me@<postgres-host>:5432/queue_reminiscence
```

Where `<postgres-host>` is reachable from the Docker containers — typically `host-gateway` (Docker's `host-gateway` extra host) or the LAN IP of your Postgres server.

---

## Environment Configuration

```bash
cp .env.example .env
$EDITOR .env
```

Key values to set for homelab:

| Variable | Example | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgres://queue_reminiscence:...@192.168.1.10:5432/queue_reminiscence` | External Postgres |
| `PUBLIC_APP_URL` | `https://queue.example.com` | Public-facing display app URL |
| `ADMIN_APP_URL` | `https://queue-admin.example.com` | Admin app URL |
| `API_PUBLIC_BASE_URL` | `https://queue-api.example.com/api` | Public app → API (or same origin if proxied) |
| `API_ADMIN_BASE_URL` | `https://queue-api.example.com/api` | Admin app → API |
| `SESSION_SECRET` | _(generate: `openssl rand -hex 32`)_ | Must be secret and stable |
| `TOKEN_HMAC_SECRET` | _(generate: `openssl rand -hex 32`)_ | Must be secret and stable |
| `RATE_LIMIT_HMAC_SECRET` | _(generate: `openssl rand -hex 32`)_ | Must be secret and stable |
| `TRUST_PROXY` | **`true`** | Required when Traefik terminates TLS |
| `ADMIN_SESSION_TTL_DAYS` | `14` | Adjust to policy |
| `PUBLIC_MUTATION_SESSION_TTL_HOURS` | `8` | Adjust to policy |

> **`TRUST_PROXY=true` is required.** Without it, the API misreads client IP from the `X-Forwarded-For` header injected by Traefik, which breaks rate limiting and audit metadata. Set it only when a trusted proxy (Traefik) sits in front of the API.

Generate secrets:

```bash
openssl rand -hex 32   # run once per secret variable
```

---

## Start the Stack

```bash
docker compose -f docker-compose.homelab.yml up -d
```

This starts **three app containers only** — no Postgres, no Traefik:

| Container | Internal Port | Description |
|-----------|---------------|-------------|
| `qr-api` | 3002 | Bun + Elysia API |
| `qr-admin` | 3001 | SvelteKit admin web app |
| `qr-display` | 3000 | SvelteKit public/display web app |

Traefik discovers the containers via Docker labels in `docker-compose.homelab.yml` and routes external traffic to them.

---

## First-Run: Migrations and Seed

Run once after the containers are up:

```bash
# Migrate the schema
docker compose -f docker-compose.homelab.yml exec qr-api \
  bun run --cwd /app/packages/db db:migrate

# Seed the first admin and demo org/venue/board
SEED_ADMIN_EMAIL=admin@example.com \
SEED_ADMIN_PASSWORD=your-strong-password \
docker compose -f docker-compose.homelab.yml exec -e SEED_ADMIN_EMAIL -e SEED_ADMIN_PASSWORD qr-api \
  bun run --cwd /app/packages/db db:seed
```

The seed is **idempotent** — safe to re-run; it won't duplicate records.

---

## Traefik Labels Reference

`docker-compose.homelab.yml` includes Traefik labels similar to:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.qr-api.rule=Host(`queue-api.example.com`)"
  - "traefik.http.routers.qr-api.entrypoints=websecure"
  - "traefik.http.routers.qr-api.tls=true"
  - "traefik.http.services.qr-api.loadbalancer.server.port=3002"
```

Adjust hostnames and entrypoint names to match your Traefik configuration. The API, admin, and display apps each get their own router rule.

If your Traefik uses a shared external Docker network (e.g., `traefik-net`), add that network to each service in the compose file and attach `qr-*` containers to it.

---

## Backups

Backup responsibility belongs to your shared Postgres operations — this stack owns no database.

Recommended approach:

```bash
# Dump (run on Postgres host or via Docker)
pg_dump -U queue_reminiscence -h localhost queue_reminiscence \
  | gzip > /backups/queue_reminiscence_$(date +%Y%m%d_%H%M%S).sql.gz
```

Schedule via cron or your homelab backup tool (Restic, Borg, etc.). Restore:

```bash
gunzip < backup.sql.gz | psql -U queue_reminiscence -h localhost queue_reminiscence
```

---

## Upgrades

1. Pull the new image (or rebuild locally):
   ```bash
   docker compose -f docker-compose.homelab.yml pull
   ```

2. Run migrations before restarting app containers:
   ```bash
   docker compose -f docker-compose.homelab.yml run --rm qr-api \
     bun run --cwd /app/packages/db db:migrate
   ```

3. Restart the stack:
   ```bash
   docker compose -f docker-compose.homelab.yml up -d
   ```

---

## Health Check

```bash
curl https://queue-api.example.com/healthz
# {"ok":true}

curl https://queue-api.example.com/readyz
# {"ok":true}  — or error if DB is unreachable
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `TRUST_PROXY` omitted / `false` | Cookies set `Secure` but proxy strips HTTPS; rate-limit IPs wrong | Set `TRUST_PROXY=true` |
| Admin session cookie lost on page load | `ADMIN_APP_URL` doesn't match the Traefik-routed URL exactly | Match scheme+host exactly |
| Public board CORS error | `PUBLIC_APP_URL` wrong | Set to the exact public-web origin |
| DB connection refused | Containers can't reach Postgres host | Use `host-gateway` extra host or correct LAN IP |
| Traefik `404` for all routes | `traefik.enable=true` label missing or wrong network | Check container labels and shared network |
