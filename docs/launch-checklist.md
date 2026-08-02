# GadgetBid Launch Checklist

## Payment Correctness

- Wallet funding: initialize Paystack funding, complete webhook, verify wallet balance, and reject duplicate webhook credits.
- Order Paystack payment: initialize from unpaid order, verify payment, release bid commitment hold, move order to processing, and notify buyer, seller, and backoffice.
- Wallet order payment: require full order balance, deduct total amount once, release bid commitment hold, and reject locked wallets.
- Refunds: cancel paid order, credit buyer wallet once, prevent duplicate refund transactions, and hold seller payout.
- Seller payout: delivered paid order moves to ready payout, admin payout paid credits seller once, and duplicate payout attempts are blocked.
- Paystack sandbox: complete `docs/paystack-sandbox-runbook.md` for wallet funding, order payment, duplicate webhook replay, invalid signature rejection, and Paystack delivery logs.

## Backoffice Operations

- Seller action: paid processing order can only move to sent to backoffice.
- Backoffice receiving: admin moves sent to backoffice to received by backoffice.
- Shipping: admin adds/updates tracking number and moves order to shipped.
- Delivery: buyer confirms delivered, then payout moves to ready.
- Disputes: buyer or seller opens dispute, payout moves/holds for review, admin resolves with clear notes.

## Bid Commitment Rules

- Bidder must have at least ₦1,000 available wallet balance before placing a bid.
- Current winning bidder has ₦1,000 held as a commitment deposit.
- If outbid, the ₦1,000 hold is released.
- Winner must pay within 24 hours.
- Missed payment forfeits the ₦1,000 hold, suspends the account, creates a pending ₦5,000 penalty, and offers the order to the second-place bidder.
- Admin reactivates the suspended account only after verifying the ₦5,000 penalty payment.

## Production Readiness

- Environment: run the production env audit and verify `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, Paystack live keys/webhook URL, `FRONTEND_URL`, `MOBILE_APP_URL`, mobile API URL, and socket URL.
- Webhooks: verify Paystack signature in production, replay a signed staging webhook, and confirm webhook URL points to the production backend.
- Admins: create at least two admin accounts and remove test admin credentials.
- Backups: schedule automated PostgreSQL backups and test one restore before launch.
- Logging: confirm API errors, Paystack events, webhook failures, auction expiry, order expiry, and payout actions are logged.
- Rate limits: confirm auth, refresh, wallet funding, payment verification, and bid endpoints are rate limited appropriately.
- Data cleanup: remove seed/test users, test gadgets, test auctions, and fake payments from production.
