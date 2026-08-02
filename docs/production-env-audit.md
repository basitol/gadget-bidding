# Production Environment Audit

The backend now fails startup in production when launch-critical environment values are missing, weak, or unsafe.

## Strict production checks

When `NODE_ENV=production`, `validateEnvironment()` enforces:

- `DATABASE_URL` is set and does not point to localhost or private LAN addresses.
- `REDIS_URL` is set and does not point to localhost or private LAN addresses.
- `JWT_SECRET` and `JWT_REFRESH_SECRET` are both strong random values of at least 48 characters.
- JWT access and refresh secrets are different.
- `PAYSTACK_SECRET_KEY` starts with `sk_live_`.
- `PAYSTACK_PUBLIC_KEY` starts with `pk_live_`.
- `PAYSTACK_WEBHOOK_URL` is HTTPS, non-local, and ends with `/webhooks/paystack`.
- `FRONTEND_URL` is HTTPS and non-local.
- `MOBILE_APP_URL` is a valid app URL scheme or HTTPS URL and is not the local default.
- `TERMII_API_KEY` is set.
- Cloudinary cloud name, API key, and API secret are all set.
- Global production rate-limit values are not dangerously high.
- Scoped production rate limits are configured for auth, auth-session refresh/logout, OTP, bids, wallet funding, wallet withdrawals, payment verification, support messages, notification mutations, and admin mutations.
- `LOG_LEVEL` is `info`, `warn`, or `error`.

## Generate secrets

```bash
openssl rand -base64 48
```

Generate separate values for `JWT_SECRET` and `JWT_REFRESH_SECRET`.

## Expected production examples

```env
NODE_ENV=production
DATABASE_URL=postgresql://gadgetbid_app:...@db.example.com:5432/gadget_bidding
REDIS_URL=rediss://default:...@redis.example.com:6379
JWT_SECRET=<48+ char random secret>
JWT_REFRESH_SECRET=<different 48+ char random secret>
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_PUBLIC_KEY=pk_live_...
PAYSTACK_WEBHOOK_URL=https://api.gadgetbid.ng/api/v1/webhooks/paystack
FRONTEND_URL=https://admin.gadgetbid.ng
MOBILE_APP_URL=gadgetbid://
TERMII_API_KEY=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
LOG_LEVEL=info
```

## Client-side envs to verify

The backend cannot validate build-time mobile/admin dashboard envs. Before release, verify:

- Admin dashboard `VITE_API_URL` points to the production API base URL.
- Admin dashboard `VITE_SOCKET_URL` points to the production socket origin.
- Mobile `EXPO_PUBLIC_API_HOST` points to the production backend host.
- No client build contains local development IP addresses.
