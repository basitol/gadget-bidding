# LinkedIn Post — Pre-launch Hardening

Paste the block below into LinkedIn. See commit `555d0d0` for the underlying work.

---

**Pre-launch hardening: the boring (but critical) work nobody posts about 🚀**

Shipping a real money platform in Nigeria means the "hardening pass" gets real fast. Over the last stretch on our gadget auction marketplace (Node/Express + Postgres + Paystack), we tightened three things before staging deploy:

🔒 **Payment money-safety**
- Payment verification now validates the transaction against the *current* order state — the buyer who owns it, the exact amount (within ₦0.01), and its purpose. A stale reference from a displaced buyer can no longer settle a reassigned order.
- When an order is offered to the second-place bidder, the previous buyer's pending payment references are voided first.
- Wallet escrow now accounts for other active bid holds when you pay — you can't double-spend funds tied up in other auctions.

🕵️ **Privacy / PII cleanup**
- Seller phone numbers dropped from public API responses.
- Auction reserve prices hidden unless you're the seller (or an admin).
- Paystack gateway error bodies (customer names, account numbers, card metadata) redacted from logs.
- Payment references switched from timestamp+substring to UUIDs.

🛡️ **Deploy readiness**
- Security gates (CORS, CSP, trust proxy, socket origins, secret validation) now key off `APP_ENV` instead of `NODE_ENV` — because Render doesn't set `NODE_ENV`, and we refused to let staging silently run with development defaults.
- CI-style checks: type-check, lint, tests, build, and an env audit all green.

The unglamorous work — money flows, PII, config gating — is exactly where a launch either survives or doesn't. Grateful for the team's discipline on this one.

What's one "boring" fix you shipped before launch that saved you later? 👇
