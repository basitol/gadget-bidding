# Verification checklist

Prove a change works before it's approved. "It compiles" is step one, not the finish line. Report what you ran and what you couldn't run — never claim a check you skipped.

## 1. Always (every diff)

Run from the repo root.

- [ ] **Type-check backend, admin, web, shared:**
  ```bash
  pnpm -r type-check
  ```
- [ ] **Type-check mobile** — it has no `type-check` script, so `pnpm -r` skips it:
  ```bash
  cd packages/mobile && npx tsc --noEmit
  ```
- [ ] **Lint backend** (baseline 2026-11-28: 2 known errors, see [BUGS.md](BUGS.md) — don't add more):
  ```bash
  pnpm --filter @gadget-bidding/backend lint
  ```
- [ ] **Diff review:** `git diff --stat` touches only files the task needed. No stray edits to generated files, lockfile, `.env`, or someone else's in-progress work.
- [ ] **No secrets** in the diff (keys, passwords, QA credentials, real phone numbers/emails).
- [ ] **[CONSTRAINTS.md](CONSTRAINTS.md)** — nothing on the blacklist was touched.

There are **no automated tests** (`jest --passWithNoTests`). Behaviour must be checked by running it (§3–§5).

## 2. If you touched…

| Area | Also do |
| --- | --- |
| `packages/shared` | `pnpm --filter @gadget-bidding/shared build`, then re-run both type-checks (backend and mobile consume `dist/`). |
| `schema.prisma` | New migration folder in `prisma/migrations` (never edit an applied one) → `cd packages/backend && pnpm exec prisma validate && pnpm prisma:generate && pnpm db:migrate` locally. For risky ones: `pnpm db:validate:empty` against a `_migration_test` DB. |
| A DB CHECK-constrained column (statuses, verification types) | Confirm the value is allowed by the constraint in the migration SQL, not just the Prisma enum/string. |
| Money (wallet, holds, orders, payouts, refunds, webhooks) | Walk the flow in [FLOW.md](FLOW.md); confirm it's inside a transaction, idempotent on replay, and can't go negative. Run `pnpm test:payments:e2e` (throwaway DB) for wallet/order payment changes. Paystack: `docs/paystack-sandbox-runbook.md`. |
| Anything returned to buyers or sellers | Identity masking still holds: buyers see seller CV code only; sellers never see buyer name/address; device identifier never leaves admin. |
| Raw SQL with timestamps | UTC-vs-Lagos session TZ handled (see DECISIONS.md › Auctions). |
| Mobile native module / `app.json` / config plugin | Needs a new dev build; confirm the JS still loads on an old build (lazy require). |
| UI (mobile, admin, emails) | Matches `docs/DESIGN_GUIDE.md` tokens exactly; copy follows AGENTS.md tone rules (no raw enums, no exclamation marks, no emoji). |
| Admin routes / socket events | Admin guard (`adminOnly`) and rate limit applied; dashboard `api.ts` updated. |
| Env vars | Added to `.env.example` with a comment and to [ENV.md](ENV.md). Production-critical ones also to `validateEnvironment()`. |

## 3. Backend runtime check

```bash
pnpm dev:backend
```
- [ ] Server starts without errors; `GET /healthz` returns OK.
- [ ] Hit the changed endpoint(s) with curl or the app; check the response shape `{ success, data | error }`.
- [ ] Watch logs for Prisma errors, unhandled rejections, job failures.

## 4. Mobile check

```bash
pnpm dev:mobile
```
- [ ] The changed screen renders on iOS simulator (or device dev build); no red box / yellow box.
- [ ] Happy path + one failure path (offline, validation error, server error) behave.
- [ ] Light and dark appearance both legible.
- [ ] Keyboard doesn't cover inputs/footers (use `GlassKeyboardView` inside `GlassScreen`).

## 5. Admin dashboard check

```bash
pnpm dev:admin
```
- [ ] Page loads at `http://localhost:5173`, data is real (no placeholders), loading/error/empty states render.
- [ ] Browser console has no errors.
- [ ] Optional smoke against a running API: `pnpm --filter @gadget-bidding/backend smoke:admin`.

## 6. Before a commit or PR

- [ ] Every box above that applies is ticked, and the PR description lists what was **not** verified.
- [ ] [HANDOVER.md](HANDOVER.md) updated if the branch state or next steps changed.
- [ ] Non-obvious choices added to [DECISIONS.md](DECISIONS.md); regressions/AI mistakes to [BUGS.md](BUGS.md).

## Before a release

Use the existing runbooks: `docs/launch-checklist.md`, `docs/testing-readiness.md`, `docs/admin-launch-smoke.md`, `docs/production-env-audit.md` (`pnpm env:audit`), `docs/db-readiness.md`.
