# GadgetBid Security Guide

This document describes security controls for the GadgetBid platform and how to configure them locally and in production.

## Environment variables

**Location:** `packages/backend/.env` (never commit this file)

Your local database URL format:

```env
DATABASE_URL=postgresql://abdulbasitquadri@localhost:5432/gadget_bidding
```

### Required (all environments)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (Prisma + pg pool) |
| `JWT_SECRET` | Signs access tokens |
| `JWT_REFRESH_SECRET` | Signs refresh tokens |

### Required (production only)

| Variable | Purpose |
|----------|---------|
| `PAYSTACK_SECRET_KEY` | Payments and webhook verification |
| `TERMII_API_KEY` | SMS OTP delivery |
| `NODE_ENV=production` | Enables strict validation and hardened defaults |

Generate strong secrets:

```bash
openssl rand -base64 48
```

Copy `.env.example` to `.env` and replace all placeholder values before deploying.

## What is protected

| Control | Implementation |
|---------|----------------|
| HTTP headers | `helmet()` |
| CORS | Restricted origins in production |
| Rate limiting | Global API + stricter auth/payment limits |
| Password hashing | bcrypt (`BCRYPT_SALT_ROUNDS`, default 10) |
| Auth | JWT access + refresh; phone OTP verification |
| Role access | `sellerOnly`, `adminOnly` middleware |
| Webhook integrity | Paystack HMAC-SHA512 on raw body |
| Token storage (mobile) | Expo SecureStore |
| Secrets in git | `.gitignore` blocks `.env` files |

## Rate limits (defaults)

| Scope | Limit | Window |
|-------|-------|--------|
| General API | 100 requests | 15 min (`RATE_LIMIT_*`) |
| Auth (login, register, OTP) | 20 requests | 15 min |
| Wallet / payments | 30 requests | 15 min |

Tune via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS` in `.env`.

## Database security

- Use a dedicated PostgreSQL user with least privilege (not superuser in production).
- Keep `DATABASE_URL` out of logs, CI output, and client apps.
- Run migrations with `001_sync_prisma_schema.sql` on existing DBs; never expose migration credentials.

## Production checklist

- [ ] `NODE_ENV=production`
- [ ] Strong `JWT_SECRET` and `JWT_REFRESH_SECRET` (32+ chars)
- [ ] HTTPS terminated at load balancer / reverse proxy
- [ ] `FRONTEND_URL` and `MOBILE_APP_URL` set for CORS and Socket.io
- [ ] Paystack webhook URL points to HTTPS endpoint
- [ ] Redis and PostgreSQL not publicly exposed
- [ ] Log level `info` or `warn`; no OTP or tokens in logs
- [ ] Dependency audit: `pnpm audit`

## Reporting issues

Report security vulnerabilities privately to the project owner — do not open public issues for undisclosed vulnerabilities.

## AI / contributor rules

Cursor agents follow `.cursor/rules/security.mdc` for all code changes in this repository.
