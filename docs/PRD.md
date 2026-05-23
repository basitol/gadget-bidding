# Product Requirements Document (PRD)

## GadgetBid — Nigerian Gadget Auction Platform

| Field | Value |
|-------|-------|
| **Version** | 1.0 |
| **Date** | May 23, 2026 |
| **Status** | Draft (based on current codebase) |
| **Product** | GadgetBid (`gadget-bidding` monorepo) |
| **Owner** | Product / Engineering |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Non-Goals](#3-goals--non-goals)
4. [Target Market](#4-target-market)
5. [User Personas](#5-user-personas)
6. [User Roles & Permissions](#6-user-roles--permissions)
7. [Core User Journeys](#7-core-user-journeys)
8. [Functional Requirements](#8-functional-requirements)
9. [Epics, User Stories & Acceptance Criteria](#9-epics-user-stories--acceptance-criteria)
10. [Non-Functional Requirements](#10-non-functional-requirements)
11. [Technical Architecture](#11-technical-architecture)
12. [Business Rules](#12-business-rules)
13. [Success Metrics](#13-success-metrics)
14. [Release Roadmap](#14-release-roadmap)
15. [Risks & Dependencies](#15-risks--dependencies)
16. [Open Questions](#16-open-questions)
17. [Appendix — API Surface](#17-appendix--api-surface)

---

## 1. Executive Summary

GadgetBid is a mobile-first marketplace for buying and selling gadgets in Nigeria through **real-time English auctions**. Users fund a **NGN wallet**, place bids with **escrow-backed holds**, and complete purchases through an integrated **order and payment flow**. Sellers list gadgets, run auctions, and fulfill orders. Admins moderate listings.

The product targets the Nigerian market with local phone auth, Naira currency, Paystack payments, and Termii SMS. Core backend and mobile flows exist today; admin tooling, some payment rails, disputes, and push notifications remain incomplete.

---

## 2. Problem Statement

Nigerians buying and selling used or new gadgets often rely on informal channels (WhatsApp, Instagram, classifieds) with weak trust, no escrow, and no transparent bidding. Sellers struggle to reach serious buyers; buyers struggle to verify fair pricing and secure payment.

GadgetBid addresses this with:

- Live competitive bidding
- Wallet-backed bid escrow
- Structured post-auction orders
- SMS-verified accounts
- Moderated gadget listings

---

## 3. Goals & Non-Goals

### Goals

- Enable secure, real-time gadget auctions in NGN
- Provide wallet funding and bid escrow to reduce payment risk
- Support end-to-end commerce: list → auction → win → pay → ship → deliver
- Optimize for Nigeria: phone numbers, Paystack, Termii SMS
- Ship a polished mobile experience for bidders and sellers

### Non-Goals (v1)

- International markets / multi-currency
- Dutch or sealed-bid auction formats
- Full marketplace fixed-price storefront (auctions only)
- In-app chat between buyer and seller
- Native admin mobile app (web admin dashboard is planned separately)

---

## 4. Target Market

| Attribute | Detail |
|-----------|--------|
| Geography | Nigeria |
| Currency | NGN (₦) |
| Primary users | Gadget buyers, resellers, individual sellers |
| Devices | iOS and Android (React Native / Expo) |
| Connectivity | Online-first; offline support is aspirational, not built |

---

## 5. User Personas

### 5.1 Bidder / Buyer

- Wants deals on phones, laptops, accessories
- Needs wallet balance and bid confidence
- Cares about outbid alerts and auction countdowns

### 5.2 Seller

- Lists gadgets for auction
- Sets starting price, reserve, optional Buy Now
- Ships after payment and tracks fulfillment

### 5.3 Admin

- Approves or rejects gadget listings
- (Planned) Manages users, disputes, platform operations
- No admin UI exists yet; APIs partially exist

---

## 6. User Roles & Permissions

| Role | Can do today | Restrictions |
|------|----------------|----------------|
| **User** (default on register) | Browse, bid, fund wallet, manage orders | Cannot list/sell until upgraded |
| **Seller** | Create gadgets, create/manage auctions, fulfill orders | Gadgets require admin approval |
| **Admin** | Approve/reject gadgets via API | No dashboard UI yet |

**Known gap:** Registration assigns role `user`, but seller checks expect `seller` or `admin`. Seller upgrade is currently a manual/support step.

---

## 7. Core User Journeys

### 7.1 Registration & Login

1. User registers with phone, name, password (email optional)
2. Backend creates account and sends OTP via Termii SMS
3. User enters OTP on verification screen
4. Account marked verified; JWT issued
5. User can log in with phone + password

**Current state:** Wired end-to-end. In dev, OTP is logged to backend console when SMS key is invalid.

### 7.2 Browse & Bid

1. User browses Home, Search, or Category
2. Opens auction detail
3. Joins auction room via Socket.io
4. Places bid via REST (or socket)
5. Wallet hold placed for bid amount
6. Previous high bidder hold released on outbid
7. Real-time bid updates broadcast to room

### 7.3 Buy Now

1. User taps Buy Now on eligible auction
2. Order created immediately at Buy Now price
3. User pays via wallet or Paystack

### 7.4 Sell a Gadget

1. Seller creates gadget listing (images, specs, condition)
2. Listing enters `pending` status
3. Admin approves listing
4. Seller creates auction (start/end, pricing rules)
5. Auction goes live on schedule or immediately

### 7.5 Win & Pay

1. Auction ends; winner determined
2. Order created with 5% platform fee
3. Winner pays via wallet or Paystack WebView
4. Seller updates fulfillment / tracking
5. Buyer confirms delivery
6. Seller payout credited

### 7.6 Wallet

1. User views balance and transaction history
2. Funds wallet via Paystack
3. Bid holds appear as escrow transactions
4. Withdrawal UI exists but backend flow is incomplete

---

## 8. Functional Requirements

### 8.1 Authentication

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| AUTH-01 | Register with Nigerian phone number | P0 | Done |
| AUTH-02 | OTP verification via SMS | P0 | Done |
| AUTH-03 | Login with phone + password | P0 | Done |
| AUTH-04 | JWT access + refresh tokens | P0 | Done |
| AUTH-05 | Resend OTP | P1 | Done |
| AUTH-06 | Block login until verified | P0 | Done |
| AUTH-07 | Forgot password flow | P2 | Not built |

### 8.2 Auctions & Bidding

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| AUC-01 | List active/scheduled/ended auctions | P0 | Done |
| AUC-02 | English auction with min increment | P0 | Done |
| AUC-03 | Optional reserve price | P1 | Done |
| AUC-04 | Optional Buy Now price | P1 | Done |
| AUC-05 | Real-time bid updates (Socket.io) | P0 | Done |
| AUC-06 | Bid escrow via wallet holds | P0 | Done |
| AUC-07 | Auto-extend on last-minute bids | P1 | Done (backend) |
| AUC-08 | Background job: activate scheduled / end expired | P0 | Done |
| AUC-09 | Hot auctions / ending soon sections | P1 | Partial |
| AUC-10 | Auto-bid / max bid | P3 | Not built |

### 8.3 Gadget Listings

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| GAD-01 | Create gadget with category, condition, specs | P0 | Done |
| GAD-02 | Multiple images per listing | P1 | URL input only |
| GAD-03 | Admin approve/reject workflow | P0 | API only |
| GAD-04 | Seller edit/delete own listings | P1 | Done |
| GAD-05 | Cloudinary image upload | P1 | Not wired |

### 8.4 Wallet & Payments

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| PAY-01 | NGN wallet with transaction history | P0 | Done |
| PAY-02 | Fund wallet via Paystack | P0 | Done |
| PAY-03 | Paystack webhook verification | P0 | Done |
| PAY-04 | Order payment via Paystack WebView | P0 | Done |
| PAY-05 | Wallet payment for orders | P1 | Done |
| PAY-06 | Bank list + account resolve (Paystack) | P2 | Done |
| PAY-07 | Automated withdrawals | P2 | Stub |
| PAY-08 | Flutterwave integration | P2 | Config only |
| PAY-09 | Bank transfer funding | P3 | Schema only |

### 8.5 Orders & Fulfillment

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| ORD-01 | Create order from won auction / Buy Now | P0 | Done |
| ORD-02 | 5% platform fee on orders | P0 | Done |
| ORD-03 | Shipping address capture | P1 | Done |
| ORD-04 | Seller fulfillment + tracking | P1 | Done |
| ORD-05 | Buyer confirm delivery | P1 | Done |
| ORD-06 | Seller payout on completion | P1 | Done |
| ORD-07 | Dispute filing & resolution | P2 | DB only |

### 8.6 Notifications

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| NOT-01 | OTP SMS via Termii | P0 | Done |
| NOT-02 | Transactional SMS (outbid, won, shipped) | P1 | Done |
| NOT-03 | In-app notification list | P1 | Done |
| NOT-04 | Real-time notification via socket | P1 | Done |
| NOT-05 | Push notifications (FCM / Expo) | P2 | Not built |
| NOT-06 | Email notifications | P3 | Not built |

### 8.7 Admin (Planned)

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| ADM-01 | Admin web dashboard | P1 | Not built |
| ADM-02 | Approve/reject gadgets | P0 | API only |
| ADM-03 | User/role management | P1 | Not built |
| ADM-04 | Dispute management | P2 | Not built |
| ADM-05 | Audit log viewer | P2 | DB only |

### 8.8 Mobile App Screens

| Screen | Status |
|--------|--------|
| Login, Register, OTP | Done |
| Home (featured, hot, ending soon) | Done |
| Search, Category | Done |
| Auction Detail | Done |
| Wallet | Done (withdraw stub) |
| Sell → Create Gadget → Create Auction | Done |
| Profile, Orders, Order Detail, Payment | Done |
| My Bids, My Auctions | Done |
| Notifications | Done |
| Settings | Menu item only |

---

## 9. Epics, User Stories & Acceptance Criteria

### Epic 1: Account & Identity

#### US-1.1 — Register with phone number

**As a** new user  
**I want to** register with my Nigerian phone number  
**So that** I can start bidding on gadgets

**Acceptance criteria:**

- [ ] User can enter full name, phone, optional email, and password
- [ ] Phone is validated as a Nigerian number and formatted to international (`+234...`)
- [ ] Password must meet complexity rules (8+ chars, upper, lower, number)
- [ ] Duplicate phone or email returns a clear error
- [ ] On success, user receives `verification_id` and is navigated to OTP screen
- [ ] OTP is sent via Termii; in dev, OTP is logged to backend console

#### US-1.2 — Verify phone with OTP

**As a** newly registered user  
**I want to** verify my phone with a 6-digit OTP  
**So that** my account is activated

**Acceptance criteria:**

- [ ] User can enter a 6-digit OTP with auto-advance between fields
- [ ] Verify sends `{ verification_id, otp }` to backend
- [ ] Valid OTP marks user as verified and stores JWT tokens
- [ ] App navigates to main experience after successful verification
- [ ] Invalid or expired OTP shows error and clears input
- [ ] User can resend OTP after 60-second cooldown

#### US-1.3 — Login

**As a** verified user  
**I want to** log in with phone and password  
**So that** I can access my account

**Acceptance criteria:**

- [ ] Login succeeds for verified users with correct credentials
- [ ] Unverified users receive error: verify phone first
- [ ] Invalid credentials return generic error (no user enumeration)
- [ ] Tokens stored securely (SecureStore)
- [ ] Session persists across app restarts until logout

#### US-1.4 — Forgot password (future)

**As a** user who forgot my password  
**I want to** reset it via OTP  
**So that** I can regain access

**Acceptance criteria:**

- [ ] User can request reset OTP via phone number
- [ ] OTP verified before password change allowed
- [ ] New password must meet complexity rules
- [ ] Old refresh tokens revoked on reset

---

### Epic 2: Browse & Discover Auctions

#### US-2.1 — Browse home feed

**As a** bidder  
**I want to** see active, hot, and ending-soon auctions on home  
**So that** I can find items to bid on quickly

**Acceptance criteria:**

- [ ] Home loads active auctions, hot auctions, and ending-soon sections
- [ ] Each auction card shows image, title, current price, time remaining
- [ ] Pull-to-refresh reloads all sections
- [ ] Tapping a card opens auction detail
- [ ] Empty states shown when no auctions available

#### US-2.2 — Search and filter

**As a** bidder  
**I want to** search and filter auctions  
**So that** I can find specific gadgets

**Acceptance criteria:**

- [ ] Search accepts text query with debounce
- [ ] Category chips filter results
- [ ] Results paginate or scroll without freezing UI
- [ ] No results shows helpful empty state

#### US-2.3 — View auction detail

**As a** bidder  
**I want to** view full auction details  
**So that** I can decide whether to bid

**Acceptance criteria:**

- [ ] Detail shows gadget images, specs, condition, seller info
- [ ] Current price, bid count, min increment, and countdown visible
- [ ] Reserve met/not met indicated when reserve exists
- [ ] Buy Now button shown when applicable
- [ ] User auto-joins socket room for live updates

---

### Epic 3: Bidding & Escrow

#### US-3.1 — Place a bid

**As a** verified bidder with wallet balance  
**I want to** place a bid on an active auction  
**So that** I can compete to win the gadget

**Acceptance criteria:**

- [ ] Bid must exceed current price + min increment
- [ ] Bid amount is held in wallet escrow (`bid_holds`)
- [ ] Insufficient balance shows clear error with link to fund wallet
- [ ] Successful bid updates auction current price and bid count
- [ ] All users in auction room receive real-time bid update
- [ ] Previous high bidder hold is released on outbid

#### US-3.2 — Receive outbid notification

**As a** bidder who was outbid  
**I want to** be notified immediately  
**So that** I can rebid if I choose

**Acceptance criteria:**

- [ ] Socket emits outbid event to affected user
- [ ] In-app notification created
- [ ] SMS sent when SMS channel enabled
- [ ] Wallet hold for outbid amount released

#### US-3.3 — Buy Now

**As a** bidder  
**I want to** buy immediately at the Buy Now price  
**So that** I can skip the auction

**Acceptance criteria:**

- [ ] Buy Now only available when auction has buy_now_price and is active
- [ ] Order created at Buy Now price
- [ ] Auction ends immediately
- [ ] User navigated to payment flow

#### US-3.4 — Win auction

**As the** highest bidder when auction ends  
**I want to** be notified and receive an order  
**So that** I can complete payment

**Acceptance criteria:**

- [ ] Background job ends expired auctions
- [ ] Winner determined by highest valid bid
- [ ] Reserve price enforced (no winner if not met)
- [ ] Order created for winner with platform fee
- [ ] Winner notified via socket, in-app, and SMS
- [ ] Non-winning bidders' holds released

---

### Epic 4: Wallet & Payments

#### US-4.1 — View wallet balance

**As a** user  
**I want to** see my wallet balance and history  
**So that** I know how much I can bid with

**Acceptance criteria:**

- [ ] Balance shows available and held amounts
- [ ] Transaction list shows deposits, holds, releases, charges
- [ ] Transactions paginated with type labels

#### US-4.2 — Fund wallet via Paystack

**As a** user  
**I want to** add money via Paystack  
**So that** I can place bids

**Acceptance criteria:**

- [ ] User enters amount (min ₦100, max ₦10M)
- [ ] Paystack authorization URL opened in browser/WebView
- [ ] Successful payment credits wallet via webhook or verify endpoint
- [ ] Failed payment shows error; no balance change
- [ ] Transaction recorded with Paystack reference

#### US-4.3 — Pay for order

**As a** buyer with a pending order  
**I want to** pay via wallet or Paystack  
**So that** the seller can ship my item

**Acceptance criteria:**

- [ ] Wallet payment deducts from balance (or held bid amount)
- [ ] Paystack payment opens WebView checkout
- [ ] Order status updates to paid on success
- [ ] Seller notified of payment

#### US-4.4 — Withdraw funds (future)

**As a** seller  
**I want to** withdraw wallet balance to my bank  
**So that** I can access my earnings

**Acceptance criteria:**

- [ ] User selects bank and enters account number
- [ ] Account name resolved via Paystack
- [ ] Withdrawal initiates Paystack transfer
- [ ] Transaction marked pending → completed/failed
- [ ] Minimum withdrawal amount enforced

---

### Epic 5: Selling & Listings

#### US-5.1 — Create gadget listing

**As a** seller  
**I want to** list a gadget for sale  
**So that** I can auction it

**Acceptance criteria:**

- [ ] Seller can enter title, description, category, condition, specs
- [ ] At least one image required
- [ ] Listing saved with status `pending`
- [ ] Seller sees confirmation and next step to create auction

#### US-5.2 — Create auction

**As a** seller with an approved gadget  
**I want to** create an auction  
**So that** buyers can bid

**Acceptance criteria:**

- [ ] Seller sets starting price, optional reserve, optional Buy Now
- [ ] Seller sets duration or schedule start/end
- [ ] Min bid increment defaults to platform minimum
- [ ] Auction status is `scheduled` or `active` based on start time
- [ ] Only approved gadgets can be auctioned

#### US-5.3 — Manage my listings and auctions

**As a** seller  
**I want to** view and manage my listings and auctions  
**So that** I can track my sales

**Acceptance criteria:**

- [ ] My Listings shows gadgets with status (pending, approved, rejected)
- [ ] My Auctions shows active, scheduled, ended auctions
- [ ] Seller can cancel active auction (if no bids or per policy)
- [ ] Rejected gadgets show rejection reason

#### US-5.4 — Seller onboarding (future)

**As a** regular user  
**I want to** apply to become a seller  
**So that** I can list gadgets without contacting support

**Acceptance criteria:**

- [ ] User can submit seller application from Sell tab
- [ ] Admin approves or rejects application
- [ ] On approval, role upgraded to `seller`
- [ ] Sell tab unlocked after approval

---

### Epic 6: Orders & Fulfillment

#### US-6.1 — View my orders

**As a** buyer or seller  
**I want to** see my orders  
**So that** I can track purchases and sales

**Acceptance criteria:**

- [ ] Buyer sees purchases; seller sees sales
- [ ] Order shows status, amount, gadget, counterparty
- [ ] Tapping order opens detail screen

#### US-6.2 — Seller ships order

**As a** seller  
**I want to** update fulfillment status and tracking  
**So that** the buyer knows their item is on the way

**Acceptance criteria:**

- [ ] Seller can mark order as shipped
- [ ] Seller can enter tracking number
- [ ] Buyer notified via in-app and SMS
- [ ] Order fulfillment status updates

#### US-6.3 — Buyer confirms delivery

**As a** buyer  
**I want to** confirm I received my item  
**So that** the transaction completes and seller gets paid

**Acceptance criteria:**

- [ ] Buyer can confirm delivery on shipped orders
- [ ] Order status moves to completed
- [ ] Seller wallet credited (sale amount minus platform fee)
- [ ] Both parties notified

#### US-6.4 — File dispute (future)

**As a** buyer  
**I want to** open a dispute on an order  
**So that** I can resolve issues with the transaction

**Acceptance criteria:**

- [ ] Buyer can file dispute with reason and evidence
- [ ] Order status moves to disputed; payout held
- [ ] Admin can review and resolve (refund, release, partial)
- [ ] Both parties notified of outcome

---

### Epic 7: Notifications

#### US-7.1 — In-app notifications

**As a** user  
**I want to** see notifications in the app  
**So that** I stay informed about bids and orders

**Acceptance criteria:**

- [ ] Notification list loads from API
- [ ] Unread count available
- [ ] User can mark single or all as read
- [ ] Tapping notification navigates to relevant screen

#### US-7.2 — Push notifications (future)

**As a** user  
**I want to** receive push alerts  
**So that** I don't miss time-sensitive bids

**Acceptance criteria:**

- [ ] App registers device token on login
- [ ] Push sent for outbid, auction ending, won, order updates
- [ ] User can disable push in settings
- [ ] Tapping push opens relevant screen

---

### Epic 8: Admin Platform

#### US-8.1 — Admin dashboard (future)

**As an** admin  
**I want to** a web dashboard  
**So that** I can manage the platform

**Acceptance criteria:**

- [ ] Admin can log in with admin role
- [ ] Dashboard shows pending gadgets, active disputes, key metrics
- [ ] Responsive web UI at `packages/admin-dashboard`

#### US-8.2 — Approve/reject gadgets

**As an** admin  
**I want to** review pending gadget listings  
**So that** only legitimate items are auctioned

**Acceptance criteria:**

- [ ] Admin sees queue of pending gadgets with images and details
- [ ] Approve moves status to `approved`
- [ ] Reject requires reason; seller notified
- [ ] Actions logged in audit log

#### US-8.3 — Manage users and roles (future)

**As an** admin  
**I want to** view users and change roles  
**So that** I can onboard sellers and handle abuse

**Acceptance criteria:**

- [ ] Admin can search users by phone/name
- [ ] Admin can upgrade user to seller or deactivate account
- [ ] Role changes logged in audit log

---

## 10. Non-Functional Requirements

| Category | Requirement | Status |
|----------|-------------|--------|
| Security | JWT auth, bcrypt passwords, webhook signature verification | Done |
| Security | Rate limiting (100 req / 15 min) | Configured, not mounted |
| Security | HTTPS in production | Planned |
| Data integrity | ACID bid transactions with row-level locking | Done |
| Performance | Real-time bid broadcast < 1s perceived latency | Done (single node) |
| Scalability | Redis + Socket.io adapter for multi-node | Not wired |
| Reliability | Graceful shutdown, background auction jobs | Done |
| Observability | Winston structured logging | Done |
| Testing | Unit / E2E / load tests | Not implemented |
| Availability | 99.5% uptime target | TBD |

---

## 11. Technical Architecture

```
┌─────────────────┐     REST + WebSocket     ┌─────────────────┐
│  Mobile App     │ ◄──────────────────────► │  Backend API    │
│  (Expo / RN)    │                          │  (Express/TS)   │
└─────────────────┘                          └────────┬────────┘
                                                    │
                    ┌───────────────────────────────┼───────────────────────────────┐
                    │                               │                               │
              ┌─────▼─────┐                  ┌──────▼──────┐                 ┌──────▼──────┐
              │ PostgreSQL │                  │    Redis    │                 │  Socket.io  │
              │  (Prisma)  │                  │  (cache)    │                 │  (realtime) │
              └───────────┘                  └─────────────┘                 └─────────────┘

External: Paystack · Termii SMS · Cloudinary (planned) · FCM (planned)
```

### Monorepo packages

| Package | Purpose |
|---------|---------|
| `packages/mobile` | Expo React Native app |
| `packages/backend` | Node.js API + jobs + sockets |
| `packages/shared` | Shared TypeScript types |
| `packages/admin-dashboard` | Planned — not created |

### Tech stack

- **Mobile:** Expo 54, React Native, React Navigation, Zustand, Axios, Socket.io client
- **Backend:** Express, TypeScript, Prisma, PostgreSQL, Redis, Socket.io, Winston
- **Payments:** Paystack (active)
- **SMS:** Termii

---

## 12. Business Rules

| Rule | Value |
|------|-------|
| Currency | NGN (₦) |
| Min bid increment | ₦1,000 (mobile config); verify backend alignment |
| Platform fee | 5% on orders |
| Auto-extend | Last-minute bid extends auction (backend: 5 min; mobile config: 2 min — align) |
| OTP expiry | 10 minutes (configurable) |
| New user wallet (dev) | ₦1,000 starting balance |
| Gadget approval | Required before auction goes live |
| Login gate | Must verify phone before login |

---

## 13. Success Metrics

| Metric | Target (6 months post-launch) |
|--------|-------------------------------|
| Registered users | 10,000+ |
| Monthly active bidders | 2,000+ |
| Auctions completed / month | 500+ |
| GMV (gross merchandise value) | ₦50M+ / month |
| Bid-to-win conversion | Track baseline |
| Payment success rate | > 95% |
| OTP verification rate | > 80% within 10 min |
| Average time to ship | < 3 days |

---

## 14. Release Roadmap

### Phase 1 — MVP (Current ~80%)

- Auth + OTP
- Auctions + real-time bidding
- Wallet + Paystack funding
- Orders + payment flow
- Seller listing flow
- Fix role model (user → seller upgrade)
- Wire rate limiting
- Image upload (Cloudinary)

### Phase 2 — Admin & Trust

- Admin dashboard (gadget moderation, users, roles)
- Dispute flow (file, review, resolve)
- Automated withdrawals
- Push notifications
- Seller self-service onboarding

### Phase 3 — Growth

- Flutterwave + bank transfer
- Auto-bid
- Advanced search/filters
- Seller analytics
- Referral / promo wallet credits
- Redis socket scaling + Bull job queue

---

## 15. Risks & Dependencies

| Risk | Impact | Mitigation |
|------|--------|------------|
| Termii SMS downtime | Users can't verify | Dev OTP logging; backup resend; email fallback |
| Paystack API changes | Payments break | Webhook + verify dual path |
| Role inconsistency (`user` vs `seller`) | Sellers blocked | Unify roles; add upgrade API |
| No admin UI | Manual DB/API ops | Prioritize admin dashboard |
| Single-node Socket.io | Scale limits | Wire Redis adapter |
| No automated tests | Regression risk | Add critical path E2E tests |

### External dependencies

- Termii API key (SMS)
- Paystack secret + public keys
- PostgreSQL + Redis (local or hosted)
- Apple/Google app store (future production mobile)
- Cloudinary (when image upload ships)

---

## 16. Open Questions

1. Should every registered user be a `bidder` by default, with `seller` as an upgrade?
2. Is ₦1,000 starting wallet balance production policy or dev-only?
3. Minimum bid increment: ₦1,000 or another value?
4. Admin dashboard: separate web app (Next.js/Vite) or extend backend with SSR?
5. Disputes: buyer-initiated only, or seller too?
6. Withdrawals: instant Paystack transfer or manual review above a threshold?

---

## 17. Appendix — API Surface

**Base URL:** `/api/v1`

| Module | Key endpoints |
|--------|----------------|
| Auth | `POST register`, `verify-otp`, `login`, `resend-otp`, `GET me` |
| Auctions | `GET /`, `POST /`, `GET /:id`, cancel, my-auctions |
| Bids | `POST /`, `POST buy-now/:id`, my-bids |
| Gadgets | CRUD + `approve` / `reject` (admin) |
| Wallet | balance, fund, transactions, banks |
| Orders | purchases, sales, payment, fulfillment, delivery |
| Notifications | list, read, unread-count |
| Webhooks | Paystack |

---

*Document generated from codebase analysis. Update this file as features ship or requirements change.*
