#!/bin/sh
set -e

case "$APP" in
  api)
    bun run --cwd packages/db db:migrate
    if [ "${RUN_SEED:-false}" = "true" ]; then
      if [ -z "$SEED_ADMIN_EMAIL" ] || [ -z "$SEED_ADMIN_PASSWORD" ]; then
        echo "Error: RUN_SEED=true requires SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD" >&2
        exit 1
      fi
      bun run --cwd packages/db db:seed
    fi
    exec bun run apps/api/src/index.ts
    ;;
  admin-web)
    export PORT="${PORT:-3001}"
    exec bun apps/admin-web/build/index.js
    ;;
  public-web)
    export PORT="${PORT:-3000}"
    exec bun apps/public-web/build/index.js
    ;;
  *)
    echo "Error: APP must be set to one of: api, admin-web, public-web" >&2
    exit 1
    ;;
esac
