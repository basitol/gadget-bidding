# Roadmap

Small, single-purpose tasks — **one task per prompt/session**. Each has a "done when" so it can be verified with [CHECKLIST.md](CHECKLIST.md). Product scope lives in `docs/PRD.md`; this is the engineering queue.

Status: `todo` · `doing` · `done` · `needs decision` (product call first). Priority order within each section is top-down; the owner reorders.

## Now

| # | Task | Status | Done when |
| --- | --- | --- | --- |
| 1 | Finish seller hub (mobile screens) and verify listing-manage / hub / listing-pause (backend committed in `fab1297`) | doing | Hub screens registered in `screens/sell/hub`; migrations apply on a clean DB (`pnpm db:validate:empty`); manage and hub flows walked on a device. |
| 2 | Decide missed-payment window: 90 days (code) vs 365 days (decision) | needs decision | One value in `MISSED_PAYMENT_LOOKBACK_DAYS`, comment, DECISIONS.md and app copy agree. |
| 3 | Round kobo conversions in `paystack.service.ts` (l.43, l.209) | todo | All `* 100` wrapped in `Math.round`; wallet funding + order payment verified in Paystack sandbox. |
| 4 | Fix the 2 backend lint errors | todo | `pnpm --filter @gadget-bidding/backend lint` exits 0. |
| 5 | Add a `type-check` script to `packages/mobile` | todo | `pnpm -r type-check` covers mobile. |

## Next — correctness risks (from BUGS.md)

| # | Task | Status | Done when |
| --- | --- | --- | --- |
| 6 | Lock the auction row in `placeBid` (`SELECT … FOR UPDATE`) | todo | Two concurrent bids at the same amount can't both succeed (scripted test). |
| 7 | Create the buy-now order inside the same transaction (or make it recoverable) | todo | Forced failure after buy-now leaves no ended auction without an order. |
| 8 | Make hold releases atomic with `endAuction` | todo | `releaseHold` accepts the caller's `tx`. |
| 9 | Socket auth checks `isActive`; socket `bid:place` respects the app-version gate | todo | Suspended user's socket is refused; old app can't bid via socket. |
| 10 | Emit `order:updated` from order status changes (or remove the admin listener) | todo | Admin orders page updates live. |
| 11 | First automated tests: wallet funding idempotency, placeBid rules, payout run | todo | `pnpm test` runs real tests in CI. |

## Later — platform

| # | Task | Status | Done when |
| --- | --- | --- | --- |
| 12 | Settle Paystack transfer webhooks → enable `SELLER_PAYOUTS_LIVE` on staging | needs decision | A staging payout completes end to end without staff marking it. |
| 13 | Buyer wallet withdrawals (currently 503) | needs decision | Product rules agreed; flow built with 2-step. |
| 14 | Multi-instance readiness: Redis socket adapter, shared rate-limit store, single job runner | todo | Two backend instances run without double jobs or lost socket events. |
| 15 | Expo SDK upgrade (54 → current) | needs decision | Separate branch; dev build + EAS build pass on both platforms. |
| 16 | Wire `expo-updates` (OTA) or remove it | needs decision | |
| 17 | Remove unused deps (`bull`, `crypto` placeholder) and dead `migrate:*` scripts | todo | Install + build + type-check pass. |
| 18 | Refresh stale docs: `SETUP.md`, `README.md`, `docs/launch-checklist.md`; delete root `app.json`/`eas.json` stubs | todo | Docs match DECISIONS.md and ARCHITECTURE.md. |
| 19 | Confirm queue review targets (KYB 24 h, listings 24 h, hub 8 h, disputes 48 h) | needs decision | Product signs off or new values set. |

## Rules for adding tasks

- One user-visible outcome per row. If it needs "and", split it.
- Write "done when" as something checkable, not "works".
- Link the decision or bug it comes from.
