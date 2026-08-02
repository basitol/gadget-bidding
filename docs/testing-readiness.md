# Testing Readiness

Use this before controlled buyer/seller/admin testing. The goal is to make staging repeatable, not perfect.

## 1. Prepare staging backend

Staging must have its own PostgreSQL database, Redis instance, API URL, socket URL, Paystack sandbox keys, and webhook URL. Do not point staging mobile/admin clients at a local laptop API.

Required first pass:

```bash
cd packages/backend
pnpm db:migrate
pnpm env:audit
```

If this is a brand-new database, also run the empty DB validation from `docs/db-readiness.md` against a throwaway database before touching the staging DB.

## 2. Seed known test accounts

The staging seed is idempotent. It creates or updates one admin, one seller, one buyer, core gadget categories, a default buyer address, and one active low-price demo auction.

```bash
cd packages/backend
STAGING_SEED_CONFIRM=seed-gadgetbid-staging pnpm seed:staging
```

Default credentials:

| Role   | Phone            | Password         | Purpose                                        |
| ------ | ---------------- | ---------------- | ---------------------------------------------- |
| Admin  | `+2348010000001` | `AdminTest123!`  | Admin dashboard, approvals, orders, audit logs |
| Seller | `+2348020000002` | `SellerTest123!` | Seller app listing and auction tests           |
| Buyer  | `+2348030000003` | `BuyerTest123!`  | Buyer app bidding, wallet, payment tests       |

Override credentials with environment variables before running the seed:

```bash
STAGING_SEED_CONFIRM=seed-gadgetbid-staging \
STAGING_SEED_ADMIN_PHONE="+234..." \
STAGING_SEED_ADMIN_PASSWORD="..." \
STAGING_SEED_SELLER_PHONE="+234..." \
STAGING_SEED_SELLER_PASSWORD="..." \
STAGING_SEED_BUYER_PHONE="+234..." \
STAGING_SEED_BUYER_PASSWORD="..." \
pnpm seed:staging
```

Optional seed knobs:

- `STAGING_SEED_BUYER_WALLET=10000` sets the buyer wallet balance.
- `STAGING_SEED_CREATE_AUCTION=false` skips the demo auction.
- `STAGING_SEED_ADMIN_EMAIL`, `STAGING_SEED_SELLER_EMAIL`, and `STAGING_SEED_BUYER_EMAIL` override emails.

## 3. Point clients to staging

Configure mobile and admin dashboard with staging values:

- API base URL points to staging `/api/v1`.
- Socket URL points to the staging backend host.
- Paystack is in sandbox mode.
- Push/SMS/email providers are either sandboxed or explicitly allowed for test accounts.

Then verify:

- Admin login stays alive after several minutes.
- Buyer and seller login stays alive after app background/foreground.
- Notifications appear for seller-created gadget, auction creation, bid placed, payment action, and support message.

## 4. Run controlled smoke flow

Run this once after every staging deploy:

1. Seller signs in and lists a gadget.
2. Admin approves the gadget.
3. Seller creates/starts an auction.
4. Buyer funds wallet with Paystack sandbox.
5. Buyer places a bid and wins or uses buy-now.
6. Buyer pays order with Paystack and with wallet in a separate run.
7. Seller confirms drop-off to backoffice.
8. Admin marks backoffice received, shipped, delivered, payout ready, then payout paid.
9. Admin checks notifications, audit logs, users, seller profile, orders, payments, and support.
10. Buyer checks order status and saved address.

## 5. Run automated checks

```bash
cd packages/backend
ADMIN_SMOKE_API_URL="https://staging-api.example.com/api/v1" \
ADMIN_SMOKE_PHONE="+2348010000001" \
ADMIN_SMOKE_PASSWORD="AdminTest123!" \
pnpm smoke:admin
```

For payment correctness, run the payment E2E harness against a throwaway database and run the Paystack sandbox manual checks in `docs/paystack-sandbox-runbook.md`.

## 6. Testing exit criteria

Controlled testing can start only when:

- `pnpm db:migrate` passes on staging.
- `pnpm env:audit` passes for staging configuration.
- `pnpm seed:staging` completes and printed credentials work.
- Admin dashboard smoke passes.
- One buyer/seller/admin manual smoke flow completes without direct database edits.
- Paystack sandbox wallet funding and order payment both verify correctly.
