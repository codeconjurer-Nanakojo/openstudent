#!/usr/bin/env bash
set -euo pipefail

# Export local public.users to CSV and JSON.
# Defaults to Supabase local Postgres at port 54322.
# Usage: scripts/export-users.sh

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)/.."
cd "$ROOT_DIR"

mkdir -p exports

: "${LOCAL_DB_URL:=postgresql://postgres:postgres@localhost:54322/postgres}"

echo "[export-users] Exporting CSV to exports/users.csv"
psql "$LOCAL_DB_URL" \
  -c "\\copy (select id, email, role, full_name, is_verified from public.users) to 'exports/users.csv' csv header"

echo "[export-users] Exporting JSON to exports/users.json"
# Produce a single JSON array of user objects
psql "$LOCAL_DB_URL" -At \
  -c "select coalesce(json_agg(row_to_json(t)), '[]'::json) from (select id, email, role, full_name, is_verified from public.users) t" \
  > exports/users.json

echo "[export-users] Done. Files written: exports/users.csv, exports/users.json"
