# Admin Launch Smoke Tests

Run this after every staging or production deploy before allowing real users onto the system.

## Automated API smoke

Set an admin account that is safe to use for read-only checks:

```bash
cd packages/backend
ADMIN_SMOKE_API_URL="https://api.gadgetbid.ng/api/v1" \
ADMIN_SMOKE_PHONE="+234..." \
ADMIN_SMOKE_PASSWORD="..." \
pnpm smoke:admin
```

The script checks:

- Admin login and `/auth/me`.
- Refresh token flow when a refresh token is returned.
- Dashboard stats.
- Paginated admin pages for activity, gadgets, pending gadgets, auctions, orders, users, disputes, payments, audit logs, support threads, and notifications.
- Notification unread count.
- Seller profile payload when a seller is present on the first users page.
- Support messages payload when a support thread exists.

The script is intentionally read-only. It does not approve gadgets, update orders, reply to support, refund money, or close disputes.

## Manual UI smoke

Open the admin dashboard and verify:

- Login screen accepts admin credentials and rejects non-admin credentials.
- Dashboard cards load without `Request failed`.
- Notifications bell opens a bounded scroll panel and the full notifications page loads.
- Users page paginates, separates buyer/seller/admin roles clearly, and seller profile modal opens.
- Gadgets page shows readable labels, not raw enum values.
- Auctions page loads active/ended/cancelled filters.
- Orders/backoffice page shows seller drop-off, backoffice received, shipped, delivered, dispute, payout ready, and payout paid labels.
- Order detail can save tracking number without overflowing text fields.
- Support page message list has bounded scrolling for long conversations.
- Audit log page paginates and shows readable action labels.

## Launch acceptance

Do not launch until:

- `pnpm smoke:admin` passes against production API.
- Payment E2E harness passes against a throwaway DB.
- One Paystack sandbox wallet funding and one Paystack sandbox order payment have been manually verified.
- A fresh DB backup exists and one restore test has succeeded.
