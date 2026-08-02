# Paystack Webhook Replay

Use this only against staging or local environments to verify Paystack webhook handling with a correctly signed `charge.success` payload.

The replay script does not create a payment. The target database must already contain a pending `payment_transactions.gateway_reference` matching the replay reference.

## Wallet funding replay

1. In staging, initialize wallet funding from the app or API.
2. Copy the generated Paystack reference from the pending payment transaction.
3. Replay the signed webhook:

```bash
cd packages/backend
PAYSTACK_REPLAY_WEBHOOK_URL="https://staging-api.gadgetbid.ng/api/v1/webhooks/paystack" \
PAYSTACK_REPLAY_SECRET="sk_test_or_staging_secret" \
PAYSTACK_REPLAY_REFERENCE="PAY-..." \
PAYSTACK_REPLAY_AMOUNT="25000" \
PAYSTACK_REPLAY_PURPOSE="wallet_funding" \
pnpm webhook:replay:paystack
```

Expected result:

- Backend returns `Webhook received`.
- Payment transaction moves from `pending` to `success`.
- Buyer wallet balance increases once.
- Replaying the same command again does not double-credit the wallet.

## Order payment replay

1. In staging, create an unpaid order and initialize Paystack order payment.
2. Copy the pending payment reference and order id.
3. Replay:

```bash
cd packages/backend
PAYSTACK_REPLAY_WEBHOOK_URL="https://staging-api.gadgetbid.ng/api/v1/webhooks/paystack" \
PAYSTACK_REPLAY_SECRET="sk_test_or_staging_secret" \
PAYSTACK_REPLAY_REFERENCE="PAY-..." \
PAYSTACK_REPLAY_AMOUNT="150000" \
PAYSTACK_REPLAY_PURPOSE="order_payment" \
PAYSTACK_REPLAY_ORDER_ID="order-uuid" \
PAYSTACK_REPLAY_ORDER_NUMBER="GB-..." \
pnpm webhook:replay:paystack
```

Expected result:

- Order payment moves to `paid`.
- Fulfillment moves to `processing`.
- Winning bid commitment hold is released.
- Buyer wallet balance is not charged by the webhook.
- Replaying the same command again does not duplicate release transactions.

## Dry run

Preview the exact payload and signature without sending:

```bash
pnpm webhook:replay:paystack --dry-run --url https://staging-api.gadgetbid.ng/api/v1/webhooks/paystack --secret sk_test_... --reference PAY-... --amount 25000
```

## Safety guard

The script refuses production-looking URLs by default. Use staging URLs containing `staging`, `stage`, `dev`, `preview`, or localhost.

If you intentionally need to replay against production during an incident, pass `--allow-production` or set `PAYSTACK_REPLAY_ALLOW_PRODUCTION=true`. Do not do this during normal launch testing.
