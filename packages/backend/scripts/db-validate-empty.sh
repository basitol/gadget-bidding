#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  echo "TEST_DATABASE_URL is required" >&2
  exit 1
fi

if [[ "$TEST_DATABASE_URL" != *"_migration_test"* ]]; then
  echo "Refusing validation: TEST_DATABASE_URL must point to a throwaway database containing _migration_test" >&2
  exit 1
fi

DATABASE_URL="$TEST_DATABASE_URL" pnpm exec prisma migrate deploy
DATABASE_URL="$TEST_DATABASE_URL" pnpm exec prisma validate

echo "Empty database migration validation passed"
