# Flows

How data moves across the apps, API, database and providers. File paths are under `packages/backend/src` unless stated. Diagrams are Mermaid (render on GitHub / VS Code).

## 1. Sign-in and session

```mermaid
sequenceDiagram
  participant App as Mobile / Admin
  participant API as /api/v1/auth
  participant DB as Postgres
  App->>API: POST /auth/login {email|phone, password, account_type, device_id}
  API->>DB: check password, role vs account_type, isActive, store_closed_at
  alt 2-step on and device not trusted
    API-->>App: two_factor_required + challenge
    App->>API: POST /auth/login/2fa {code}
  end
  API->>DB: insert refresh_tokens row
  API-->>App: access_token + refresh_token + user
  Note over App: Mobile: SecureStore. Admin: localStorage (gb_admin_*)
  App->>API: any call with Bearer + X-App-Version
  API->>DB: authenticate() reloads user every request
  App->>API: on 401 → POST /auth/refresh-token (once, queued)
  API-->>App: new access token (same refresh token)
```

- Sign-up variants: phone + OTP (legacy), email-first buyer (`/auth/signup/email → verify → complete`), seller (`/auth/seller/signup/*`), staff join (`/auth/staff/*`), social (`POST /auth/social`, Google/Apple).
- Mobile picks buyer vs seller at sign-in (`account_type`); the server refuses the wrong one.
- Revocation: logout = one token; password reset, account delete, store close, staff removal, admin suspend = all refresh tokens. Access JWTs live until expiry, but `isActive` is checked per request.
- Files: `services/auth/*`, `api/middlewares/auth.middleware.ts`, mobile `src/store/authStore.ts`, `src/services/api.ts`.

## 2. Listing → auction

```mermaid
flowchart TD
  A[Seller: List gadget wizard<br/>mobile screens/sell/listing] -->|POST /gadgets with profile| B[listing.service.createListing<br/>gadget status pending]
  B -->|requireSellerKyb → whyCantList| G{Seller allowed?}
  G -- no --> X[403 with reason: NOT_VERIFIED, PAUSED_BY_TEAM, LISTINGS_PAUSED, STORE_CLOSED…]
  G -- yes --> Q[Admin queue: /gadgets listing review]
  Q -->|approve| C[gadget.service.approveGadget<br/>insert Auction active or scheduled<br/>gadget listed]
  Q -->|reject + reason| R[gadget rejected → seller fixes and resubmits]
  C --> J[auction.job: activate scheduled]
```

- Device identifier (IMEI/serial) is saved privately with a hash for duplicate checks; only admin review sees it.
- Seller can manage a live listing (`/seller/manage`): edit or end while no bids; photos/notes added later go through `/admin/listing-additions`.
- Unsold → `POST /auctions/:id/relist` (one open run per gadget).

## 3. Bidding

```mermaid
sequenceDiagram
  participant B as Buyer app
  participant API as POST /bids (or socket bid:place)
  participant TX as placeBid transaction
  participant S as socket rooms
  B->>API: { auction_id, amount } + X-App-Version
  API->>API: biddingGate (426 old app, 503 maintenance), rate limit
  API->>TX: begin
  TX->>TX: assertBiddingOpen, auction active, not own listing, not staff, not bidding-paused
  TX->>TX: amount ≥ current + increment
  TX->>TX: previous winning bid → outbid
  TX->>TX: first bid here? create ₦1,000 BidHold (needs available balance)
  TX->>TX: within last AUTO_EXTEND_MINUTES? push end time
  TX-->>API: commit
  API->>S: bid:placed to auction room, bid:outbid to previous leader
  API->>API: resolveAutoBids → more placeBid calls
```

- Available balance = wallet balance − held holds. Holds never change the balance.
- Buy-now: `biddingService.buyNow` ends the auction in one transaction; the order is created right after in `bid.controller.ts`.
- Files: `services/bidding/bidding.service.ts`, `services/buyer/autobid.service.ts`, `api/middlewares/appGate.middleware.ts`.

## 4. Auction end → order → payment

```mermaid
flowchart TD
  E[auction.job tick: processExpiredAuctions] --> F{Reserve met and bids?}
  F -- no --> N[auction cancelled<br/>no-sale alerts, auto-bids off, holds released]
  F -- yes --> W[winning bid won, auction ended, gadget sold<br/>losers' holds released]
  W --> O[createOrderFromAuction<br/>total = price + delivery fee<br/>sellerPayout = price − platformFeeFor]
  O --> P{Buyer pays within 24 h?}
  P -- card / bank transfer / USSD --> PS[Paystack charge → webhook charge.success<br/>processOrderPayment]
  P -- wallet --> WL[confirmPayment: applyBalanceDelta debit + ledger row]
  P -- saved card --> SC[/me/orders/:id/pay-with-card/]
  PS & WL & SC --> PAID[order paid + processing<br/>winner hold released<br/>seller 'Sold' alert]
  P -- no --> MP[expirePendingOrders: keep ₦1,000 as fee,<br/>MissedPayment row, 3 strikes → 30-day bidding pause]
  MP --> SCO[Second-chance offer to next bidder, 12 h]
  SCO -->|accept| P
  SCO -->|decline / expire| SCO2[next bidder or cancel]
```

## 5. Wallet funding

```mermaid
sequenceDiagram
  participant App
  participant API
  participant PS as Paystack
  App->>API: POST /wallet/fund {amount}
  API->>PS: initialize (kobo)
  API->>API: PaymentTransaction pending (reference)
  API-->>App: authorization_url → in-app browser
  PS-->>API: POST /webhooks/paystack (raw body, HMAC-SHA512)
  App->>API: GET /wallet/verify-payment?reference (on return via gadgetbid://wallet/verify)
  Note over API: Both paths call processWalletFunding:<br/>idempotent on reference, owner + amount check,<br/>applyBalanceDelta + WalletTransaction in one tx
```

Webhook `charge.success` routing order: card verification (₦50 add-card check, refunded) → order payment → wallet funding. Files: `api/controllers/webhook.controller.ts`, `services/wallet/wallet.service.ts`, `services/order/order.service.ts`, `services/buyer/savedCard.service.ts`.

## 6. Fulfilment and escrow

```mermaid
stateDiagram-v2
  [*] --> processing: paid
  processing --> sent_to_backoffice: seller drops off (by 6 pm next hub day)
  sent_to_backoffice --> received_by_backoffice: hub receives
  received_by_backoffice --> shipped: all 7 inspection checks pass
  received_by_backoffice --> refund: hub check fails (hub.service → buyerRefund)
  shipped --> delivered
  delivered --> confirmed: buyer confirms or 48 h auto-confirm (no open case)
  confirmed --> payout_ready
  payout_ready --> payout_paid: 6 pm Lagos payout run
```

- Stage timestamps come from `order_events` (DB trigger `orders_record_event`).
- Staff app (`/staff`) marks drop-offs for a store.
- Buyers see inspection as `{passed,total,at}` only.

## 7. Cases (disputes) and refunds

```mermaid
flowchart TD
  D[Buyer opens case<br/>photos, optional video ≤60 s] --> S[Seller has 48 h: reply, files, accept refund, choose return method]
  S --> T[Team decides: next_step, hub findings]
  T -- not upheld --> C[Close; warranty reminder]
  T -- refund --> RP[order refund_pending: no confirm, no auto-confirm, payout held]
  RP --> RT[Buyer returns item → markReturnReceived]
  RT --> RF[buyerRefund.service: Paystack refund or wallet credit<br/>paymentStatus refunded]
  T -. seller asks once .-> SR[Second review → investigating]
```

Files: `services/buyer/case.service.ts` (buyer and seller sides), `services/order/buyerRefund.service.ts`, admin `/admin/disputes/*`.

## 8. Seller payouts

```mermaid
flowchart LR
  R[orders payout ready,<br/>paid + confirmed, no open case] --> RUN[runDuePayouts at 6 pm Lagos<br/>pg_advisory_xact_lock + FOR UPDATE]
  RUN --> SKIP{seller eligible?}
  SKIP -- inactive / no payout account / no 2-step / paused after account change / held --> WAIT[stay ready]
  SKIP -- yes --> B[one SellerPayout batch<br/>minus pending SellerCharges]
  B -->|SELLER_PAYOUTS_LIVE=true| T[Paystack transfer → transfer.* webhook settles]
  B -->|default| M[Team pays by hand, marks paid/failed in admin /payouts]
  T & M -- failed --> R
```

Files: `services/seller/payouts.service.ts`, `services/seller/payoutSchedule.ts`, `api/routes/adminPayouts.routes.ts`.

## 9. Notifications

`createNotification` (`services/notification/notification.service.ts`) → always: DB row + socket `notification` → then by switch (`SWITCH_FOR_TYPE` or `SELLER_SWITCH_FOR_TYPE` by role) and channel: Expo push, Resend email, Termii SMS. Quiet hours (22:00–07:00 Lagos) skip push and SMS except payment/won/defaulted alerts. Mobile routes push taps by `data.route`.

## 10. App gates and maintenance

Admin › Settings sets min/latest version and maintenance windows (`services/app/appConfig.service.ts`). Mobile reads `GET /app-config` on launch and foreground; bid endpoints return 426/503 with a body `code` the mobile interceptor turns into full-screen gates. Ending maintenance gives lost time back to affected auctions and emits `auction:extended`.
