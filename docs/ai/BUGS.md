# Bugs ledger

Regressions, edge cases and AI mistakes — what broke, why, and the guard that now prevents it. Read the **Patterns** section before touching the same area; add a row whenever something bites.

## Open

| Found | Area | Issue | Notes |
| --- | --- | --- | --- |
| 2026-11-28 | backend lint | 2 eslint errors: `no-useless-escape` in `services/buyer/case.service.ts` (~l.847), `ban-types` `{}` in `services/seller/sellerApplication.service.ts` (~l.69). | Baseline; don't add more. Fix in a cleanup pass. |
| 2026-11-28 | testing | No automated tests anywhere (`jest --passWithNoTests`). | Money and auction logic are the first candidates. |
| 2026-11-28 | tooling | Mobile has no `type-check` script, so `pnpm -r type-check` silently skips it. | Run `npx tsc --noEmit` in `packages/mobile` (CHECKLIST.md). |
| 2026-11-28 | docs | Stale docs: `SETUP.md` says to load `src/database/schema.sql` (use Prisma migrations); `README.md` lists Redux/Railway (it's zustand/Render); `docs/launch-checklist.md` describes the old missed-payment penalty (suspend + ₦5,000). | DECISIONS.md is current. |
| 2026-11-28 | mobile config | Root `app.json` / `eas.json` are stale stubs (different EAS projectId and package). Real ones are in `packages/mobile/`. | Don't edit the root copies thinking they're live. |
| 2026-11-27 | payouts | Live seller payouts are off (`SELLER_PAYOUTS_LIVE=false`): Paystack transfer webhooks don't settle withdrawals yet. Buyer withdraw returns 503. | Known gap, not a regression. |
| 2026-11-28 | missed payment | Spec vs code: decision says "3 misses in 365 days", code uses `MISSED_PAYMENT_LOOKBACK_DAYS = 90` (`order.service.ts`; a nearby comment says "in a year"). | Needs a product call, then align code or docs. |
| 2026-11-28 | payments (risk) | `paystack.service.ts` l.43 and l.209 convert naira→kobo with `amount * 100` and no `Math.round` (others round). Float amounts like 1234.56 can produce non-integer kobo. | Wrap in `Math.round` in a focused fix. |
| 2026-11-28 | bidding (risk) | `placeBid` takes no row lock on the auction; two simultaneous bids rely on transaction isolation only. | Candidate for `SELECT … FOR UPDATE`. |
| 2026-11-28 | buy-now (risk) | Buy-now ends the auction in one transaction, then creates the order **outside** it (`bid.controller.ts`). A failure leaves an ended auction with no order (only logged). | |
| 2026-11-28 | holds (risk) | `endAuction` calls `walletService.releaseHold`, which opens its own transaction — releases aren't atomic with ending the auction. | |
| 2026-11-28 | scaling (risk) | Single-instance assumptions: in-memory socket user map, auto-bid lock, payout `running` flag, in-memory rate limits, and the job interval would run on every instance. Don't scale the backend horizontally until fixed. | |
| 2026-11-28 | sockets (risk) | Socket auth only verifies the JWT; it doesn't check `isActive`. `bid:place` over socket skips the app-version gate (maintenance and staff checks still run inside `placeBid`). | |
| 2026-11-28 | admin live updates | Admin dashboard listens for socket `order:updated`, but the backend never emits it — orders pages don't live-update. | |
| 2026-11-28 | tooling | `migrate:create`, `migrate:up`, `migrate:down` scripts point at `scripts/create-migration.js` / `run-migrations.js`, which don't exist. | Use Prisma (`pnpm db:migrate`). |

## Fixed

| Date | Area | What went wrong | Root cause | Guard now |
| --- | --- | --- | --- | --- |
| 2026-11-28 | seller stats | Store card said 7 sales, Insights said 4. | Refunded orders counted as sales. | One "sale" rule (delivered + paid + not refunded) shared by all counts. |
| 2026-11-28 | mobile docs viewer | PDF showed a black frame and took ~20 s to load on iOS. | WKWebView PDF rendering. | One-page PDFs render as Cloudinary page-1 JPG. |
| 2026-11-28 | mobile layout | Footers and chat composers hidden behind the keyboard. | Bare `KeyboardAvoidingView` inside `GlassScreen` under-measured by ~60 pt. | `GlassKeyboardView`. |
| 2026-11-28 | admin | Tab indicator broke under StrictMode; Users page flashed a skeleton on every tab switch. | rAF animation; separate route wrappers remounted the page. | Web Animations API (FLIP); shared `PeopleEntry` route element. |
| 2026-11-28 | mobile | Dev builds made before `expo-camera` was added crashed on import. | Top-level import of a missing native module. | `requireOptionalNativeModule('ExpoCamera')` guard. |
| 2026-11-27 | payouts | Payout cutoff picked wrong orders. | Prisma `updated_at` read through a Lagos-TZ session vs UTC wall-clock columns. | Compare in SQL: `(cutoff::timestamptz)::timestamp`. |
| 2026-11-27 | privacy | Sellers' real names reached buyers (order actions, public auction/gadget payloads, `GET /bids/:id`). | No masking on those paths. | `maskSellerForBuyer` / `maskBuyerForSeller` / `forViewer`; bidder labels. |
| 2026-11-27 | missed payment | First missed payment suspended the account; the reassigned order expired immediately. | Old policy; reassignment kept the original payment clock. | 3-strikes pause; second-chance offer gets its own clock. |
| 2026-11-27 | escrow | Admin marking "delivered" released seller payout at once. | No buyer confirm window. | 48 h confirm + `autoConfirmDeliveries` (skips open cases). |
| 2026-11-27 | escrow | Auto-confirm could pay the seller while the buyer was returning the item for a refund. | No hold for refund-decided cases. | `refund_pending` blocks confirm, auto-confirm and payout. |
| 2026-11-27 | payments | ₦50 "add card" check would have been credited as wallet funding. | Webhook treated every charge as funding. | Webhook branches on `metadata.purpose 'card_verification'` first. |
| 2026-11-27 | cases | 60 s video limit could be bypassed. | Duration was trusted from the client. | Server reads MP4/MOV `mvhd` header. |
| 2026-11-27 | relisting | Unsold gadgets could never be auctioned again. | `auctions.gadget_id` was unique. | Partial unique index: one open run per gadget. |
| 2026-11-27 | support | Migration backfilled every support thread as a seller thread. | Buyer threads already existed. | `owner_role` backfilled from `users.role`. |
| 2026-11-27 | iOS build | `pod install` and EAS prebuild failed; partial builds crashed with React.framework missing. | Config plugin wrote a `//` marker into the Ruby Podfile. | Plugin uses `#` outside Swift and cleans up legacy markers. Never hand-fix `ios/`. |
| 2026-11-27 | Expo Go | App crashed at launch in Expo Go. | Top-level `@react-native-google-signin` import (native-only). | Lazy require when not in Expo Go. |
| 2026-11-27 | **AI mistake** | Claimed the App Store Expo Go was stuck on SDK 54. | Trusted an outdated web result. It was SDK 58 on device. | Verify version claims on the real device / official changelog. |
| pre-2026-11 | admin deploy | Refreshing a client route (e.g. `/orders`) on Vercel returned 404. | SPA routes not rewritten. | `packages/admin-dashboard/vercel.json` rewrite. |
| pre-2026-11 | backend build | Build broke on Prisma runtime imports / generated client path. | Missing `@prisma/client-runtime-utils`; generated client path moved. | Direct dependency; `build` copies `src/generated` to `dist/generated`. |

## Patterns (read these first)

1. **Timezones.** DB columns are UTC wall-clock `TIMESTAMP` while the DB session TZ is `Africa/Lagos`, and a trigger stamps `updated_at` with session-local `NOW()`. Do date maths column-to-column in SQL, or cast explicitly. Lagos is fixed UTC+1 (no DST) — use the offset, not `Intl` timezones (Hermes gaps).
2. **Native imports crash old builds.** Any module with native code must be lazily required behind a capability check.
3. **Generated folders are not source.** `ios/`, `android/`, `src/generated`, `packages/shared/dist` — fix the generator/plugin/source instead.
4. **Money paths must survive replay.** Paystack retries webhooks; staff double-click; jobs catch up after downtime. Every credit/debit/payout needs a transaction + idempotency key or conditional update.
5. **CHECK constraints beat Prisma types.** Statuses and verification types are constrained in SQL; a value Prisma accepts can still fail at insert.
6. **Privacy leaks hide in `include: { gadget: true }` and sockets.** Check every new payload path for seller names, buyer details and device identifiers.
7. **Verify external facts** (SDK versions, provider limits like Paystack test mode's 3 bank resolves/day) before building on them.
