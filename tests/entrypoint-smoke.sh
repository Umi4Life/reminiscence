#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
mkdir "$tmpdir/bin"

cat > "$tmpdir/bin/bun" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$BUN_LOG"
EOF
chmod +x "$tmpdir/bin/bun"

run_entrypoint() {
  : > "$tmpdir/bun.log"
  (
    cd "$repo_root"
    PATH="$tmpdir/bin:$PATH" BUN_LOG="$tmpdir/bun.log" "$@" sh ./docker-entrypoint.sh
  )
  cat "$tmpdir/bun.log"
}

migrate_calls=$(run_entrypoint env APP=migrate RUN_SEED=true)
[ "$migrate_calls" = "run --cwd packages/db db:migrate" ]

api_calls=$(run_entrypoint env APP=api)
[ "$api_calls" = "run apps/api/src/index.ts" ]

seed_calls=$(run_entrypoint env APP=api RUN_SEED=true SEED_ADMIN_EMAIL=admin@example.test SEED_ADMIN_PASSWORD=not-a-real-password)
[ "$seed_calls" = "run --cwd packages/db db:seed
run apps/api/src/index.ts" ]
