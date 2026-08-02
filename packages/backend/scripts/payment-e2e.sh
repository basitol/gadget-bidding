#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${PAYMENT_E2E_DATABASE_URL:-}" ]]; then
  echo "PAYMENT_E2E_DATABASE_URL is required" >&2
  exit 1
fi

if [[ "$PAYMENT_E2E_DATABASE_URL" != *"_payment_e2e"* ]]; then
  echo "Refusing payment E2E: PAYMENT_E2E_DATABASE_URL must point to a throwaway database containing _payment_e2e" >&2
  exit 1
fi

export NODE_ENV=test
export DATABASE_URL="$PAYMENT_E2E_DATABASE_URL"

pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm exec ts-node --transpile-only src/scripts/payment-e2e.ts
