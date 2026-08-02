# Database Readiness

## Migration source of truth

- Use Prisma migrations in `packages/backend/prisma/migrations` for launch and production deploys.
- Do not add new runtime tables only under `packages/backend/src/database/migrations`; fresh installs will miss them.
- Deploy migrations with:

```bash
cd packages/backend
pnpm db:migrate
```

## Empty database validation

Create a throwaway PostgreSQL database whose name contains `_migration_test`, then run:

```bash
cd packages/backend
TEST_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/gadget_bidding_migration_test" pnpm db:validate:empty
```

Expected result:

- All migrations apply cleanly from an empty database.
- `prisma validate` succeeds against the final schema.
- The database contains the app tables, including `users`, `orders`, `support_threads`, and `user_addresses`.

## Backup schedule

Run a compressed custom-format PostgreSQL backup at least daily before launch, then increase to hourly when real payments begin:

```bash
cd packages/backend
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/gadget_bidding" BACKUP_DIR="/secure/backups/gadget-bidding" pnpm db:backup
```

Minimum production rules:

- Store backups outside the app server filesystem when possible.
- Keep at least 7 daily backups and 4 weekly backups.
- Encrypt backup storage and restrict access to admins only.
- Run a backup immediately before every production migration.

## Restore test

Never test restore directly against production. Create a throwaway database whose name contains `_restore_test`, then run:

```bash
cd packages/backend
RESTORE_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/gadget_bidding_restore_test" BACKUP_FILE="/secure/backups/gadget-bidding/gadget_bidding_YYYYMMDDTHHMMSSZ.dump" pnpm db:restore
```

After restore:

- Run app smoke checks against the restore DB.
- Confirm users, wallets, auctions, orders, payments, support messages, and audit logs are present.
- Confirm a duplicate Paystack webhook cannot double-credit wallet or order payment state.

## Production migration checklist

- Confirm `DATABASE_URL` points to production only in the deploy environment.
- Take a fresh backup with `pnpm db:backup`.
- Run `pnpm db:migrate`.
- Check application logs for migration or Prisma errors.
- Run admin dashboard smoke checks for users, auctions, orders, notifications, audit logs, and support.
