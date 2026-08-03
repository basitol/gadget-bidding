# Payment E2E Harness

This harness verifies GadgetBid money-state correctness against a throwaway PostgreSQL database. It does not charge real cards.

## What it covers

- Paystack webhook signature verification.
- Paystack wallet funding success path.
- Duplicate wallet funding protection.
- Paystack order payment success path.
- Duplicate order payment processing protection.
- Wallet order payment.
- Buyer refunds and duplicate refund protection.
- Delivered paid order moving to payout ready.
- Admin payout release and duplicate payout protection.
- Bid commitment penalty flow: ₦1,000 hold forfeiture, account suspension, ₦5,000 pending penalty, and second-place order reassignment.

## Run locally

Create a throwaway database whose name contains `_payment_e2e`, then run:

```bash
cd packages/backend
PAYMENT_E2E_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/gadget_bidding_payment_e2e" pnpm test:payments:e2e
```

The script refuses to run unless `PAYMENT_E2E_DATABASE_URL` contains `_payment_e2e`.

Recommended order for launch validation:

1. Run `pnpm test:payments:e2e` against the throwaway database.
2. Run `pnpm smoke:admin` against staging or production API.
3. Complete the manual Paystack sandbox checks below.

## Paystack sandbox boundary

The harness validates internal wallet/order/refund/payout state transitions by simulating successful Paystack callbacks. Before launch, also run one manual Paystack sandbox card transaction for:

- Wallet funding initialization and verification.
- Order payment initialization and verification.
- Live Paystack webhook delivery with the production-style webhook secret.

Those sandbox transactions should land in the same service paths covered by this harness.
