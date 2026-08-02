#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

backup_dir="${BACKUP_DIR:-backups}"
timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
backup_file="${backup_dir}/gadget_bidding_${timestamp}.dump"

mkdir -p "$backup_dir"

pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$backup_file" \
  "$DATABASE_URL"

echo "$backup_file"
