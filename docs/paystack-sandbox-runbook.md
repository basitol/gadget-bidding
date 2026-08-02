# Paystack Sandbox Runbook

Use this runbook to pair one real Paystack test-mode checkout with the automated payment E2E harness. The harness proves internal money-state transitions; this runbook proves Paystack checkout, webhook delivery, webhook signature handling, and duplicate webhook safety against staging.

Sources:

- [Paystack authentication docs](https://paystack.com/docs/api/authentication/)
- [Paystack charge card docs](https://paystack.com/docs/payments/charge-card/)
- [Paystack webhook docs](https://paystack.com/docs/payments/webhooks/)

## Preconditions

- Staging backend is deployed and points to a staging PostgreSQL database.
- Staging app and admin dashboard point to the staging API and socket URL.
- Paystack test-mode keys are configured: `PAYSTACK_SECRET_KEY=sk_test_...` and `PAYSTACK_PUBLIC_KEY=pk_test_...`.
- `PAYSTACK_WEBHOOK_URL` points to the staging webhook endpoint, for example `https://staging-api.gadgetbid.ng/api/v1/webhooks/paystack`.
- The same webhook URL is configured in the Paystack Dashboard or Canvas webhook settings.
- Test buyer, seller, and admin accounts exist in staging.
- The buyer has a saved delivery address before testing order payment.
- Automated checks pass first:

```bash
cd packages/backend
PAYMENT_E2E_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/gadget_bidding_payment_e2e" pnpm test:payments:e2e
pnpm webhook:replay:paystack --dry-run --url https://staging-api.gadgetbid.ng/api/v1/webhooks/paystack --secret sk_test_... --reference PAY-TEST --amount 25000
```

## Sandbox Card

Use Paystack test mode only. Paystack documents this card for successful test transactions:

- Card number: `4084084084084081`
- CVV: `408`
- Expiry: `01/99`

If Paystack presents an additional sandbox authentication step, complete it with the value shown by Paystack for that test flow. Do not use live cards during this runbook.

## Wallet Funding

1. Sign in as the staging buyer.
2. Open Wallet and start a Paystack funding for `₦25,000`.
3. Before completing checkout, confirm a pending transaction exists:

```sql
SELECT gateway_reference, status, amount, purpose
FROM payment_transactions
WHERE purpose = 'wallet_funding'
ORDER BY created_at DESC
LIMIT 5;
```

4. Complete Paystack checkout with the sandbox card.
5. Confirm the webhook request reaches the backend and returns `200 OK`.
6. Confirm the wallet was credited exactly once:

```sql
SELECT gateway_reference, status, amount, purpose
FROM payment_transactions
WHERE gateway_reference = 'PAYSTACK_REFERENCE';

SELECT transaction_type, amount, reference
FROM wallet_transactions
WHERE reference = 'PAYSTACK_REFERENCE';
```

Expected result:

- `payment_transactions.status` is `success`.
- One wallet `deposit` exists for `₦25,000`.
- The buyer wallet available balance increases by `₦25,000`.
- Buyer and backoffice notifications are created.

## Order Payment

1. Sign in as the staging seller and create a gadget listing.
2. Approve the listing as admin and create/start the auction.
3. Sign in as the staging buyer.
4. Confirm the buyer has at least `₦1,000` available wallet balance.
5. Place a bid and allow the auction to end with that buyer as winner.
6. Open the unpaid order and choose Paystack payment.
7. Complete checkout with the sandbox card.
8. Confirm order and hold state:

```sql
SELECT order_number, payment_status, fulfillment_status, payout_status, total_amount
FROM orders
WHERE order_number = 'GB-...';

SELECT status, amount
FROM bid_holds
WHERE order_id = 'ORDER_ID';
```

Expected result:

- Order `payment_status` is `paid`.
- Order `fulfillment_status` moves to `processing`.
- Winning bid commitment hold is released.
- Buyer wallet is not deducted for the Paystack order amount.
- Buyer, seller, and backoffice notifications are created.

## Duplicate Webhook Check

After each successful sandbox payment, replay the same reference once against staging:

```bash
cd packages/backend
PAYSTACK_REPLAY_WEBHOOK_URL="https://staging-api.gadgetbid.ng/api/v1/webhooks/paystack" \
PAYSTACK_REPLAY_SECRET="sk_test_..." \
PAYSTACK_REPLAY_REFERENCE="PAYSTACK_REFERENCE" \
PAYSTACK_REPLAY_AMOUNT="25000" \
PAYSTACK_REPLAY_PURPOSE="wallet_funding" \
pnpm webhook:replay:paystack
```

For an order payment, include order metadata:

```bash
cd packages/backend
PAYSTACK_REPLAY_WEBHOOK_URL="https://staging-api.gadgetbid.ng/api/v1/webhooks/paystack" \
PAYSTACK_REPLAY_SECRET="sk_test_..." \
PAYSTACK_REPLAY_REFERENCE="PAYSTACK_REFERENCE" \
PAYSTACK_REPLAY_AMOUNT="150000" \
PAYSTACK_REPLAY_PURPOSE="order_payment" \
PAYSTACK_REPLAY_ORDER_ID="ORDER_ID" \
PAYSTACK_REPLAY_ORDER_NUMBER="GB-..." \
pnpm webhook:replay:paystack
```

Expected result:

- Backend still returns `Webhook received`.
- Wallet funding is not credited twice.
- Order payment does not create duplicate release transactions.
- Notifications are not spammed for the same payment reference.

## Invalid Signature Check

Send one intentionally bad webhook signature to staging:

```bash
curl -i -X POST "https://staging-api.gadgetbid.ng/api/v1/webhooks/paystack" \
  -H "Content-Type: application/json" \
  -H "x-paystack-signature: invalid" \
  --data '{"event":"charge.success","data":{"reference":"PAYSTACK_REFERENCE","amount":2500000,"metadata":{"purpose":"wallet_funding"}}}'
```

Expected result:

- Backend returns an error, not `200 OK`.
- No wallet, order, hold, payout, or notification state changes.
- Logs clearly show signature rejection without printing secret keys.

## Webhook Delivery Checks

- Confirm the request body is read as raw JSON before signature verification.
- Confirm `x-paystack-signature` is verified with the configured Paystack secret key.
- Confirm the webhook route returns `200 OK` quickly after accepting a valid event.
- Confirm failed webhook attempts are visible in Paystack’s test-mode webhook delivery logs.
- Allow Paystack webhook IPs only if infrastructure supports an allowlist: `52.31.139.75`, `52.49.173.169`, and `52.214.14.220`.
- Keep long-running work out of the webhook request path; process follow-up work asynchronously where possible.

Paystack retries failed test-mode webhooks hourly for 10 hours. Live-mode failures retry more aggressively at first, then hourly for 72 hours. A webhook endpoint that does not return `200 OK` within Paystack’s timeout window should be treated as broken.

## Acceptance Checklist

- Wallet funding succeeds with Paystack test card.
- Wallet duplicate webhook does not double-credit the buyer.
- Order payment succeeds with Paystack test card.
- Order duplicate webhook does not double-release holds or duplicate notifications.
- Invalid signature webhook is rejected.
- Paystack delivery logs show successful `charge.success` delivery.
- Admin notification center shows buyer and seller payment events.
- Backend logs show no raw secret key, card number, authorization header, or API key.
