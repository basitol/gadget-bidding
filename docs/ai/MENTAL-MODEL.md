# Mental model

The whole system in plain English. If you only read one file, read this one.

## What the product is

Gadgets Bidding is an auction marketplace for used and new gadgets in Lagos. Sellers are verified businesses. Buyers bid in naira. **The platform sits in the middle of every sale:** the buyer's money is held, the seller drops the item at our hub, our team checks it, we deliver it, and only after the buyer is happy does the seller get paid.

Nobody trades directly. Buyers never learn a seller's name (they see a code like `CV-1234`), and sellers never learn who bought.

## The people

- **Buyer** — browses, watches, bids, pays, receives, confirms or opens a case.
- **Seller** — a business that applied and was approved (KYB). Lists gadgets, drops sold items at the hub, gets paid daily.
- **Store staff** — a seller's employee with a tiny app: hub drop-off codes, nothing about money.
- **Team (admin)** — approves sellers and listings, runs the hub, decides cases, pays sellers, watches for abuse.

## The life of one gadget

1. **List.** Seller describes the device step by step (the questions depend on the device type), uploads photos, sets prices. The serial/IMEI is kept private.
2. **Review.** The team approves or sends it back. Approved → an auction is created.
3. **Auction.** Buyers bid. To bid you need ₦1,000 free in your wallet; it's held as a promise you'll pay if you win. Late bids push the end time out a few minutes so nobody can snipe. Buyers can set an automatic max bid.
4. **Win.** When time runs out, the top bidder wins if the reserve was met. An order is created: price + delivery fee.
5. **Pay (24 h).** Card, bank transfer, USSD, wallet or saved card — all through Paystack. Miss it and you lose the ₦1,000; miss three times and bidding pauses for 30 days. The next bidder gets a second-chance offer.
6. **Drop-off.** The seller (or their staff) drops the item at the hub by 6 pm the next working day.
7. **Hub check.** The team runs 7 checks. All must pass before it ships. If it fails, the buyer is refunded and the seller gets the item back.
8. **Delivery.** Delivered in Lagos. The buyer has 48 hours to confirm or open a case; silence counts as "fine".
9. **Payout.** Every day at 6 pm Lagos time, each seller's ready orders are paid out as one batch, minus any charges they owe. (Today the team sends the money by hand and marks it paid; automatic transfers are switched off.)

If something's wrong after delivery, the buyer opens a **case**. The seller can reply or accept a refund; the team decides. A refund waits until the item is returned.

## The pieces of software

- **Mobile app** — one app, three faces: buyer, seller, staff. You pick buyer or seller when you sign in.
- **Admin dashboard** — a website for the team: queues (sellers to approve, listings to review, hub items, cases), money, people, settings.
- **Backend** — one server that does everything: the API both apps call, live updates over websockets, and a timer that wakes every 30 seconds to end auctions, send reminders, expire unpaid orders, auto-confirm deliveries and run payouts.
- **Database** — PostgreSQL. The single record of truth. Money rules are enforced here too (a wallet can't go below zero).
- **Landing site** — a static marketing page with privacy/terms.
- **Shared package** — the rules both the app and server must agree on (device questions, fee tiers, roles).

Outside services: Paystack (money in and out), Cloudinary (photos and private documents), Resend (email), Termii (SMS), Expo (push notifications).

## The rules that protect money

- Every naira that moves is written to a ledger in the same database transaction that moves it.
- Payment confirmations can arrive twice (Paystack retries); processing them twice does nothing the second time.
- The seller is never paid while the buyer can still complain, and never while a refund is pending.
- Payouts can't run twice for the same order, even if the server restarts mid-run.

## The rules that protect people

- Identities are masked both ways; the team sees everything.
- Sellers' documents and device serial numbers are private.
- Changing your email or phone needs a code sent to the new one.
- Admins can suspend accounts or pause a seller's listings; big actions on sellers need a second admin.

## Switches the team controls (no deploy needed)

- **Minimum app version** — older apps must update before bidding.
- **Maintenance window** — stops bidding; when it ends, auctions get their lost time back.
- **Account restrictions** — suspend, pause listings, close store.

## What's fragile

Times (the database stores UTC but the connection may think it's Lagos), money maths, and anything that assumes there's only one server. See [BUGS.md](BUGS.md) › Patterns.
