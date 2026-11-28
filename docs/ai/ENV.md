# Environment variables

Plain-English meaning of every variable the code reads. **No values here, ever.** Templates with placeholders: `packages/backend/.env.example`, `packages/admin-dashboard/.env.example`. Production rules and the startup validator: `docs/production-env-audit.md`, `docs/SECURITY.md`, `packages/backend/src/config/index.ts` (`validateEnvironment()`).

Where real values live: local `.env` files (gitignored), Render dashboard (backend), Vercel (admin, web), `packages/mobile/eas.json` build profiles (mobile production).

## How the backend decides what environment it's in

- `NODE_ENV=production` turns on strict validation — the server refuses to start with weak or local values.
- `APP_ENV` picks the target: `staging` allows Paystack **test** keys, `production` requires **live** keys. Render doesn't set `NODE_ENV`, so `render.yaml` sets both.
- Several features check `NODE_ENV` directly to avoid real-world side effects in dev (staff SMS, mock device lookup).

## Backend (`packages/backend/.env`)

### Core
| Variable | Meaning |
| --- | --- |
| `NODE_ENV` | `development` or `production`. Production = strict checks. |
| `APP_ENV` | `development`, `staging` or `production`. Controls which Paystack keys are allowed. |
| `PORT` | HTTP port (default 3000). |
| `API_VERSION` | Path segment; routes live under `/api/v1`. |
| `BACKEND_URL` | Public URL of this server (used in links/callbacks). |
| `FRONTEND_URL` | Admin dashboard URL. Must be HTTPS in production. Used for CORS and email links. |
| `CORS_ORIGINS` | Extra browser origins allowed for HTTP + sockets, comma-separated. |
| `MOBILE_APP_URL` | App deep-link scheme (`gadgetbid://`) or HTTPS URL. |
| `LOG_LEVEL`, `LOG_FILE_PATH` | Winston logging. Production allows info/warn/error only. |

### Database and Redis
| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. **The** source of truth for Prisma and the pg pool. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_POOL_MIN`, `DB_POOL_MAX` | Legacy split settings / pool size. Prefer `DATABASE_URL`. |
| `REDIS_URL` (`REDIS_HOST`, `REDIS_PORT`) | Redis connection. Startup awaits `connectRedis()`, which throws if Redis is unreachable — so run Redis locally too. Today it's only used for the health ping (no socket adapter, no queues). |

### Auth
| Variable | Meaning |
| --- | --- |
| `JWT_SECRET` | Signs access tokens. 48+ random chars in production. |
| `JWT_REFRESH_SECRET` | Signs refresh tokens. Must differ from `JWT_SECRET`. |
| `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY` | Token lifetimes (`.env.example`: 15m / 30d; code default for access is 24h). The stored `refresh_tokens.expires_at` is hard-coded to +30 days regardless. |
| `TWO_FACTOR_KEY` | Encrypts authenticator-app secrets at rest. If unset, derived from `JWT_SECRET` — so **never rotate `JWT_SECRET` without setting this first**, or saved 2-step secrets become unreadable. |
| `GOOGLE_CLIENT_IDS`, `APPLE_CLIENT_IDS` | Comma-separated client IDs accepted when verifying Google / Apple sign-in tokens. |
| `BCRYPT_SALT_ROUNDS` | Password hashing cost. |
| `OTP_EXPIRY_MINUTES` | How long a sign-up / verification code lives. |

### Payments
| Variable | Meaning |
| --- | --- |
| `PAYSTACK_SECRET_KEY` | Server key. `sk_test_…` on dev/staging, `sk_live_…` only when `APP_ENV=production`. Also verifies webhook signatures. |
| `PAYSTACK_PUBLIC_KEY` | Client key, same test/live rule. |
| `PAYSTACK_WEBHOOK_URL` | HTTPS URL ending `/webhooks/paystack` that Paystack calls. |
| `MONNIFY_*` | Monnify gateway (API key, secret, contract code, base URL, webhook URL). Code exists; Paystack is the live path. |
| `SELLER_PAYOUTS_LIVE` | `true` sends real Paystack transfers in the 6 pm payout run. **Default off** — staff pay by hand and mark paid. Don't turn on until transfer webhooks settle withdrawals. |
| `DELIVERY_FEE_NGN` | Delivery fee added to orders (default 3500). |
| `PLATFORM_FEE_PERCENTAGE` | Legacy flat fee; tiered fees live in `shared/src/sellerPolicy.ts`. |

### Auctions and orders
| Variable | Meaning |
| --- | --- |
| `MIN_BID_INCREMENT` | Smallest bid step in naira. |
| `DEFAULT_AUCTION_DURATION_HOURS` | Default run length. |
| `AUTO_EXTEND_MINUTES` | Anti-snipe extension when a bid lands near the end. |
| `ORDER_PAYMENT_EXPIRY_HOURS` | Winner's payment window (default from shared `BID_PAYMENT_DEADLINE_HOURS`, 24). |
| `SECOND_CHANCE_OFFER_HOURS` | How long the next bidder has to accept a missed-payment offer (default 12). |
| `CONFIRM_WINDOW_HOURS` | Buyer's window to confirm delivery before auto-confirm (default 48). |
| `CONFIRM_DELIVERY_REMINDER_HOURS` | When to remind the buyer to confirm (default 48). |
| `PAYMENT_REMINDER_HOURS_LEFT` | Payment reminder times, comma list of hours before deadline (default `12,2`). |

### Messaging and media
| Variable | Meaning |
| --- | --- |
| `RESEND_API_KEY` | Sends email (codes, receipts, alerts). |
| `EMAIL_FROM` | Sender; must be a Resend-verified domain in production. |
| `TERMII_API_KEY`, `TERMII_SENDER_ID`, `TERMII_API_URL` | SMS. **The local key is live** — dev code paths avoid texting real numbers. |
| `EXPO_ACCESS_TOKEN` | Optional bearer for the Expo push API. |
| `PUSH_NOTIFICATIONS_DISABLED` | `true` skips phone push (in-app + socket still work). |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Image/doc storage. All three set → Cloudinary; blank locally → disk (`uploads/`, `private-uploads/`). Required in production. |
| `MAX_FILE_SIZE_MB`, `ALLOWED_IMAGE_TYPES`, `MAX_IMAGES_PER_GADGET` | Upload limits (listing flow needs 12 photos; lower values are raised to 12). |
| `DEVICE_LOOKUP_PROVIDER` (`DEVICE_LOOKUP_API_KEY`) | Serial/IMEI spec lookup: `none` (default) or `mock` (ignored when deployed). |

### Rate limits
`RATE_LIMIT_WINDOW_MS` plus `RATE_LIMIT_*_MAX_REQUESTS` for: global, read, write, auth, auth-session, OTP, bid, wallet funding, wallet withdrawal, payment verification, support message, notification mutation, admin mutation. Production refuses dangerously high values.

### App release
| Variable | Meaning |
| --- | --- |
| `APP_MIN_VERSION` | Below this the app shows "Time to update" and bids get 426. Admin Settings overrides it. |
| `APP_LATEST_VERSION` | Newest store version (soft prompt). |
| `APP_IOS_STORE_URL`, `APP_ANDROID_STORE_URL` | Store links for the update screen. |
| `APP_WHATS_NEW` | "What's new" lines, `|`-separated. |

### Scripts only (not read by the server)
- `STAGING_SEED_*` — `pnpm seed:staging` (requires `STAGING_SEED_CONFIRM=seed-gadgetbid-staging`). See `docs/testing-readiness.md`.
- `ADMIN_SMOKE_*` — `pnpm smoke:admin`.
- `PAYSTACK_REPLAY_DRY_RUN`, `PAYSTACK_REPLAY_ALLOW_PRODUCTION` — webhook replay script.
- `TEST_DATABASE_URL`, `RESTORE_DATABASE_URL`, `BACKUP_DIR`, `BACKUP_FILE` — DB validate/backup/restore scripts.
- `QA_*` (local `.env` only) — QA account passwords used during manual testing. Never commit, never put in docs.

## Mobile (`packages/mobile/.env`, `eas.json` env blocks)
Only `EXPO_PUBLIC_*` reaches the app, and it is **baked into the bundle** — anything here is public. Never put a secret in it.

| Variable | Meaning |
| --- | --- |
| `EXPO_PUBLIC_API_HOST` | Dev only: LAN IP of the machine running the backend (for a physical phone). Falls back to simulator/emulator defaults. |
| `EXPO_PUBLIC_API_URL` | Production API base (`…/api/v1`). Defaults to the production host. |
| `EXPO_PUBLIC_SOCKET_URL` | Production socket origin. |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID`, `…_IOS_CLIENT_ID`, `…_ANDROID_CLIENT_ID` | Google sign-in client IDs. |
| `EXPO_PUBLIC_APPLE_CLIENT_ID` | Apple sign-in service ID. |
| `EXPO_PUBLIC_SENTRY_DSN` | Crash reporting DSN (has a default in `src/constants/config.ts`). |

Note: the backend `.env` currently also contains `EXPO_PUBLIC_GOOGLE_*` entries including a client **secret** — the backend doesn't read them; they're leftovers. The secret must never move into the mobile `.env`.

## Admin dashboard (Vercel env)
| Variable | Meaning |
| --- | --- |
| `VITE_API_URL` | API base. Unset locally → Vite proxies `/api` to `:3000`. |
| `VITE_SOCKET_URL` | Socket origin. |
| `VITE_SITE_URL` | Canonical public origin for meta/OG tags. |

## Root `.env`
Contains Paystack keys only; nothing in the workspace reads it directly. Treat as a leftover.
