#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
tmpdir=$(mktemp -d)
created_env=false

cleanup() {
  if [ "$created_env" = true ]; then
    rm -f "$repo_root/.env"
  fi
  rm -rf "$tmpdir"
}
trap cleanup EXIT

if [ ! -e "$repo_root/.env" ]; then
  cp "$repo_root/.env.example" "$repo_root/.env"
  created_env=true
fi

(
  cd "$repo_root"
  docker compose -f docker-compose.homelab.yml config --format json > "$tmpdir/default.json"
  docker compose -f docker-compose.homelab.yml --profile migrate config --format json > "$tmpdir/migrate.json"
)

python3 - "$tmpdir/default.json" "$tmpdir/migrate.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as config_file:
    default_services = json.load(config_file)["services"]
with open(sys.argv[2], encoding="utf-8") as config_file:
    migrate_services = json.load(config_file)["services"]

api = default_services["api"]
migrate = migrate_services["migrate"]

assert "migrate" not in default_services
assert api["environment"]["APP"] == "api"
assert "db:migrate" not in str(api.get("command", ""))
assert migrate["environment"]["APP"] == "migrate"
assert migrate["profiles"] == ["migrate"]
assert migrate["build"] == api["build"]
PY
