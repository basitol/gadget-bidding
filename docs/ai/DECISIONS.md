# Decisions

Why things are the way they are. Read before proposing a different approach — most of these were chosen against a real constraint (a DB check constraint, a native-rebuild cost, a design board, a money-safety rule).

Format: **Decision** — *why*. Newest at the bottom of each section. Raw source: Context Engine memory (`session_recall`); add new entries here too when they change how the codebase should be worked on.

## Platform and tooling

- **Prisma migrations in `packages/backend/prisma/migrations` are the only schema source of truth.** `src/database/schema.sql` and `src/database/migrations/` are legacy. — *Fresh installs and Render's `preDeployCommand` run `prisma migrate deploy` only.*
- **Web landing (`packages/web`) is Astro 6 static, scoped CSS, no Tailwind; `type-check` = `astro sync && tsc`.** — *Zero-JS SEO page; Astro 7 needs a newer Node than local; `@astrojs/check` breaks under pnpm.*
- **Landing page follows the user's pasted design (Sora/Manrope, `#3366FF`), not `DESIGN_GUIDE.md`.** — *User re-sent the paste as source of truth. The guide still governs mobile, admin and emails.*
- **`docs/DESIGN_GUIDE.md` is mandatory for all app/admin/email UI; `design/amber-ledger.md` is superseded.** — *User requirement.*
- **Brand pack lives in `design/gadgets-bidding-assets/` (source only); surfaces copy just what they use.** — *Keeps page weight low.*

## Mobile (Expo)

- **Animations use RN `Animated` with `useNativeDriver`; no Reanimated/Lottie/react-native-svg.** — *Not installed; adding native deps forces a new dev/EAS build.*
- **Native-only modules load lazily behind a capability check** (`@react-native-google-signin` when not in Expo Go; `expo-camera` via `requireOptionalNativeModule('ExpoCamera')`; `expo-blur` same pattern). — *Older dev builds and Expo Go crash on a top-level import.*
- **`ios/` and `android/` are generated (CNG) and untracked; native fixes go in config plugins** (e.g. `plugins/withIosSceneLifecycle.js`). — *Edits in `ios/` are lost on prebuild; a `//` marker in the Podfile once broke `pod install` and EAS.*
- **Expo SDK 54. Physical-iPhone Expo Go is SDK 58, so real devices need a dev build; simulator Expo Go 54 works.** — *Verified on device 2026-11-27.*
- **Offline detection = `networkStore` (no-response API calls + `/health` ping every 5 s) + `OfflineOverlay`; no NetInfo.** — *Avoids a native rebuild and also catches "server unreachable".*
- **Inside `GlassScreen`, use `GlassKeyboardView`, not bare `KeyboardAvoidingView`.** — *GlassScreen pads the top inset; plain KAV under-measured by ~60 pt.*
- **Copy-to-clipboard uses RN core `Clipboard`.** — *No new native dep.*
- **Skeletons use opaque Line `#EDEFF4`; status colours come from the guide via the shared glass kit.**

## Auth and accounts

- **Email-first buyer sign-up** (`/auth/signup/email → /verify → /complete`); accounts get a synthetic `+9…` phone like social login. — *Design has no phone step; phone is collected later.*
- **Password reset never reveals whether an email exists and revokes all refresh tokens; no auto sign-in after reset.**
- **2-step sign-in methods: email | totp | sms.** Secrets live AES-256-GCM-encrypted in `users.totp_secret` (live + pending + last-used step); challenges are `user_verifications` rows with an encoded `target`. Trusted devices (sha256 of device id, max 10) skip the challenge. — *No schema change was allowed; `verification_type` is CHECK-limited to phone|email|kyc; last-used step blocks TOTP replay.*
- **Email/phone changes verify the NEW address and warn the old one** (`/me/contact/start|resend|verify`). — *Swapping contact details without proof was a takeover risk.*
- **Account deletion is an anonymising soft delete, refused while money or obligations are open** (unpaid/unfinished order, open dispute, live bid/listing, wallet > 0). — *Orders, disputes and payouts must keep their records.*
- **Store staff have their own role `staff`** with tokens limited to `/staff`, `/auth`, `/app-config`, push-token; `placeBid` refuses staff. — *Staff must not see payouts or bid on their store's listings.*
- **Staff pickup-code SMS only sends when `NODE_ENV=production`.** — *The local Termii key is live.*

## Auctions and bidding

- **₦1,000 bid commitment: one `BidHold` per bidder per auction, created on their first bid and re-linked on later bids.** Holds don't change the wallet balance; they reduce *available* balance. Losers' holds are released when the auction ends (not at the moment they're outbid); the winner's is released on payment or kept as a fee on a missed payment. *(Older docs say "released when outbid" — the code doesn't; the release block in `placeBid` is commented out.)*
- **Missed payment: keep the ₦1,000, record `missed_payments`; 3 misses → `bidding_paused_until` +30 days. No suspension, no ₦5,000 penalty.** Order goes to the next bidder as a 12 h second-chance offer; accepting starts a 24 h payment clock. — *Per pasted design; supersedes the older rule still written in `docs/launch-checklist.md`.* Window: the decision said 365 days, code uses `MISSED_PAYMENT_LOOKBACK_DAYS = 90` — open question in BUGS.md.
- **Auto-bid = proxy bidding resolved after every bid inside `placeBid` (`isAutoBid`).**
- **Bid gates: 426 `APP_UPDATE_REQUIRED` (only when `X-App-Version` is sent and too old) and 503 `MAINTENANCE`**, as middleware on bid routes plus `assertBiddingOpen(tx)` inside `placeBid`/`buyNow`. — *Old apps without the header keep working; the in-transaction check covers socket bids and auto-bids.*
- **Maintenance end adds lost time back to each affected auction in one SQL `UPDATE` inside the same transaction as a conditional `updateMany(ended_at IS NULL)`.** — *Column-to-column arithmetic avoids the UTC-vs-Lagos TZ trap; the conditional update makes it once-only.*
- **Relisting: `auctions.gadget_id` is not unique; a partial unique index allows one scheduled/active run per gadget.** Blocked after a sale or a staff cancel.
- **Reserve-not-met auctions are stored as `cancelled`; the buyer-facing outcome (`no_sale`, etc.) is derived** in `auctionResult.service.ts`.
- **Listing views: `auctions.view_count` counter + `auction_view_days`; one count per viewer/IP per 30 min (in-memory); seller and admins skipped.**
- **Sellers can't end a listing after the first bid; live no-bid listings can change prices but not times.**
- **List-a-gadget flow is driven by `shared/src/deviceProfiles.ts` (21 device profiles).** Full IMEI/serial is stored only in `gadgets.device_identifier` (+hash), hidden by a Prisma global `omit` and `stripPrivate` on raw SQL; admins read it only in `GET /admin/gadgets/:id`. Serial lookup is a pluggable provider, off by default. — *One contract for app and server validation; identifiers must never leak.*

## Orders, hub and delivery

- **Buyer order stages map onto existing fulfilment statuses; per-stage times come from `order_events`, written by DB trigger `orders_record_event`.** — *Covers every code path that moves an order without touching each one.*
- **Hub inspection: 7 fixed checks in `orders.inspection`; an order can't leave the hub until all 7 pass.** Buyers see only `{passed,total,at}`.
- **Seller drop-off deadline = 6:00 pm Lagos (fixed UTC+1) on the next hub working day (Mon–Sat) after the paid event.** — *No `paid_at` column; Lagos has no DST; avoids Hermes Intl gaps.*
- **Buyer has 48 h after delivery to confirm or report; `autoConfirmDeliveries` confirms after that unless a case is open. Admin "delivered" no longer releases payout.**
- **A refund-decided case sets `refund_pending` and blocks confirm/auto-confirm/payout until the item is back.**
- **Delivery is Lagos-only; landmark stored in `address_line2`; rider note copied into the order's `shipping_address` JSON.**

## Money

- **Paystack is the live gateway; bank transfer and USSD use the Paystack Charge API** (USSD only GTBank 737, Zenith 966, UBA 919 work).
- **Saved cards store the Paystack authorization (backend only). "+ Add card" = ₦50 card-only check refunded immediately (`metadata.purpose 'card_verification'`); the webhook branches on it before order/wallet logic.** — *Otherwise the webhook would credit ₦50 as wallet funding.*
- **Seller payouts: one batch per seller per 6 pm Lagos run** (`payouts.service.ts runDuePayouts`, every job tick, under `pg_advisory_xact_lock`). Failed/reversed → orders back to `ready`. Charges are taken whole, oldest first, never split, only while payout stays > ₦0.
- **`SELLER_PAYOUTS_LIVE` is off by default; staff pay by hand and mark paid in admin.** — *Paystack transfer webhooks don't settle withdrawals yet.*
- **Seller withdrawals go only to the saved payout account, which must match the registered business name, and need 2-step on. Changing the account pauses payouts 7 days.** Buyers' withdraw returns 503.
- **A "sale" = delivered, paid, and not refunded** (same rule on store card, insights, buyer store profile).

## Cases (disputes)

- **Case video: one per case, mp4/mov ≤ 50 MB ≤ 60 s, duration read from the MP4 `mvhd` header server-side.**
- **Seller side of cases lives in `buyer/case.service.ts`; seller acceptance reuses the team's `applyDecision`.** Sellers have 48 h to reply and get one second review.
- **`disputes.next_step` (≤ 120 chars) is staff-written; warranty line comes from the listing's warranty type (no end date stored).**

## Sellers

- **Seller onboarding = `seller_applications`** (draft → in_review → approved | needs_info | rejected). CAC/BN number is checked manually by staff — no fake automatic checks. Documents are private (Cloudinary `private` + 10-minute signed links).
- **Seller app tabs: Home · Listings · Orders · Payouts · Store.**
- **Seller alerts carry `data.kind`; new-bid alerts are one notification per listing updated in place, pushing at most every 30 min.**
- **Notification switches are chosen by recipient role** (`SELLER_SWITCH_FOR_TYPE` vs `SWITCH_FOR_TYPE`).
- **Closing a store sets `store_closed_at` only (account stays active so payouts still run).** — *`gadgets_status_check` has no `withdrawn`.*

## Admin

- **Users admin: `account_restrictions` (suspend | pause_listings) with real effects; sellers with live auctions or escrow need a second admin to approve.**
- **Admin system states use real data only (no invented "Super admin" tier).**
- **Seller KYB page lives at `/sellers/applications`; legacy `/sellers?...` links redirect.**
- **Queue review targets: KYB 24 h, listing review 24 h, hub inspection 8 h, dispute 48 h** (`REVIEW_TARGET_HOURS`). *Product should confirm.*
- **Public sign-in panel shows live data but never staff names or per-seller payout amounts.**

## Privacy and display

- **Identity masking: buyers see sellers only as their CV code; sellers never see buyer names or addresses.** Enforced in `maskSellerForBuyer`/`maskBuyerForSeller`, public auction/gadget payloads and sockets. Admin endpoints keep real names.
- **Listing reports are visible to staff only, never to the seller.**
- **Notification prefs are granular (9 switches × push/email/SMS + quiet hours 22:00–07:00 Lagos).** In-app list and socket always get alerts; payment/won/defaulted alerts ignore quiet hours.
- **Support chat: one open thread per user+role, optional `order_id`; buyer payloads never carry seller data.**
