# Rollback recipes

Copy-paste recovery for when a change goes sideways. **Look before you destroy:** run the "inspect" step first, and never run a destructive command against production or another person's uncommitted work.

> Multiple Claude sessions sometimes edit this checkout at the same time. Before any `restore`/`reset`/`clean`, run `git status` and confirm every file you're about to discard is yours.

## 1. Undo uncommitted changes

Inspect:
```bash
git status --short
```
```bash
git diff -- path/to/file
```

Throw away edits to one file (keeps everything else):
```bash
git restore path/to/file
```

Unstage without losing the edit:
```bash
git restore --staged path/to/file
```

Park everything instead of deleting it (recoverable with `git stash pop`):
```bash
git stash push -u -m "before-rollback $(date +%Y%m%d-%H%M)"
```

Delete untracked files — dry run first, then for real:
```bash
git clean -nd path/to/dir
```
```bash
git clean -fd path/to/dir
```

## 2. Undo a commit

Not pushed, keep the changes in the working tree:
```bash
git reset --soft HEAD~1
```

Already pushed (safe for shared branches — adds a new commit):
```bash
git revert <sha>
```

Restore one file to how it was at a commit:
```bash
git restore --source=<sha> -- path/to/file
```

Find a lost commit after a bad reset:
```bash
git reflog -20
```

Never `git push --force` to `main` or `feat/buyer-app-revamp`. If a force-push to your own branch is unavoidable, use `--force-with-lease`.

## 3. Undo a full-file refactor that broke things

1. `git diff --stat` to see the blast radius.
2. If the refactor is the only change in those files: `git restore <files>`.
3. If it's mixed with good work: `git stash push -u`, then `git checkout stash@{0} -- <good files>`, then re-apply the good parts by hand.
4. Re-run the gates in [CHECKLIST.md](CHECKLIST.md).

## 4. Database migrations (Prisma)

Prisma has **no down migrations**. Rolling back a schema change = write a new forward migration that reverses it, or restore a backup.

### A migration you haven't applied anywhere yet
Delete its folder in `packages/backend/prisma/migrations/` and revert the matching edit in `schema.prisma`.

### A migration applied only to your local DB
```bash
cd packages/backend
```
Write the reversing SQL as a new migration (preferred), or for local-only experiments:
```bash
pnpm exec prisma migrate resolve --rolled-back <migration_folder_name>
```
…then undo the SQL by hand with `psql` and delete the folder. Regenerate the client:
```bash
pnpm prisma:generate
```

### A migration that failed half-way on staging/production
1. Check state: `pnpm exec prisma migrate status`
2. Fix the cause, then either mark it rolled back (`migrate resolve --rolled-back <name>`) and redeploy a corrected migration, or mark it applied (`migrate resolve --applied <name>`) if you finished it by hand.
3. **Never edit a migration that has already run on staging or production** — Prisma checksums them. Add a new one.

### Restore from backup (last resort)
Always back up before a production migration:
```bash
cd packages/backend && DATABASE_URL="..." BACKUP_DIR="/secure/backups/gadget-bidding" pnpm db:backup
```
Test the restore on a throwaway DB whose name contains `_restore_test` (the script refuses otherwise unless `ALLOW_PRODUCTION_RESTORE=true` — don't set that without a second person):
```bash
cd packages/backend && RESTORE_DATABASE_URL="postgresql://.../gadget_bidding_restore_test" BACKUP_FILE="/secure/backups/gadget-bidding/<file>.dump" pnpm db:restore
```
Full procedure: `docs/db-readiness.md`.

## 5. Generated / native code

- **Prisma client wrong or stale** (`src/generated`): `cd packages/backend && pnpm prisma:generate`. Don't hand-edit generated files.
- **Shared types out of date** in backend/mobile: `pnpm --filter @gadget-bidding/shared build`.
- **iOS/Android native project broken:** `ios/` and `android/` are generated and gitignored. Fix the config plugin, then regenerate:
  ```bash
  cd packages/mobile && npx expo prebuild --clean
  ```
- **Metro cache weirdness:** `cd packages/mobile && npx expo start -c`.

## 6. Deploys

- **Backend (Render):** redeploy the previous successful deploy from the Render dashboard (Deploys → Rollback). If the bad deploy ran a migration, the schema stays migrated — see §4.
- **Admin / web (Vercel):** promote the previous deployment from the Vercel dashboard.
- **Mobile (EAS):** store builds can't be pulled back; ship a fixed build. Use `APP_MIN_VERSION` (Admin › Settings › App versions) to force old builds to update, or a maintenance window to stop bidding while you fix.

## 7. Money incidents

Don't "fix" balances with ad-hoc SQL. Wallet and payout state is guarded by transactions, advisory locks and idempotency checks. Stop the bleeding first:
- Turn on a maintenance window (stops bids).
- Make sure `SELLER_PAYOUTS_LIVE` is not `true`.
- Replay or inspect webhooks with `PAYSTACK_REPLAY_DRY_RUN=true pnpm webhook:replay:paystack` first; it sends for real without that flag — see `docs/paystack-webhook-replay.md`.
Then correct through admin actions so the audit log records it.
