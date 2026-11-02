# Plan: Audit endpoints, error toasts/persistence, and UI cleanup

Three workstreams, in order. Everything builds on existing patterns (AuditLog service, toastStore, sonner) — no new dependencies except none; error persistence uses AsyncStorage.

## 1. Audit: filters + pagination (backend + admin dashboard)

**Backend** — extend `getAuditLogs` in `packages/backend/src/api/controllers/admin.controller.ts` (~line 1552):
- Accept query params: `action`, `resourceType`, `resourceId`, `userId`, `from`, `to` (ISO dates), alongside existing `page`/`limit`.
- Build a Prisma `where` with equals filters + `createdAt` gte/lte range (model already has indexes on `(action, createdAt)`, `(resourceType, resourceId)`, `(userId, createdAt)`).
- Validate with an existing validator pattern in `src/api/validators/`; keep the snake_case DTO and `sendPaginated` shape unchanged so the dashboard needs no data-layer change.

**Admin dashboard** — `packages/admin-dashboard/src/pages/AuditPage.tsx`:
- Add a filter bar above the table: action dropdown (populated from a static list of known actions + free text), resource-type dropdown, actor user ID input, date range pickers, and Clear filters.
- Wire filters into the existing `adminApi.auditLogs(params)` query params (already passes arbitrary params via `qs()`).

## 2. Mobile error handling: toasts everywhere + local error log + session-expiry fix

**2a. Toast store hardening** (`src/store/toastStore.ts`, `src/components/Toast.tsx`):
- Add a small queue so rapid successive errors aren't dropped (show next after current hides).
- Add optional `title` and a `duration` override (validation alerts may need longer).

**2b. Migrate ~14 screens from `Alert.alert` to toasts:**
- Error alerts (catch blocks, validation failures) → `useToastStore.show(msg, 'error')`.
- Success alerts ("Bid placed", "Payment complete", "Saved") → `show(msg, 'success')`.
- **Keep `Alert.alert` for destructive confirmations** (delete address, cancel auction, logout prompts) — those need explicit buttons; only migrate their informative counterparts.
- Centralize the message extraction: move `getErrorMessage` from `services/api.ts` to a shared util and use it everywhere instead of per-screen inline extraction.
- Screens: OrderDetail, ShippingAddress, AuctionDetail, CreateGadget, Wallet, OtpVerification, Profile, MyAuctions, Notifications, plus any smaller ones found by grep.

**2c. Error persistence:**
- New `src/store/errorLogStore.ts` (Zustand + AsyncStorage persistence): keeps last 50 errors `{ message, screen, code?, statusCode?, timestamp }`; `show()` of an error toast also appends to the log.
- Hook the axios response interceptor to log failed requests (status, URL path, message) to the same store.
- Viewer: "Error history" item in ProfileScreen → new `ErrorHistoryScreen` (list with timestamps, tap for detail incl. status code/path, "Clear" button, copy for support). Register route in the profile navigator.

**2d. Session-expiry fix** (`src/services/api.ts`):
- On refresh-token failure, currently tokens are deleted but the app never navigates — user is stuck on a broken screen. Fix: after clearing SecureStore, emit logout through `authStore.logout()` (import lazily to avoid a cycle) or set a `forceLogout()` on the store the App root listens to; show an info toast "Session expired, please sign in again".

## 3. Admin dashboard: adopt sonner toasts

- In pages with mutations (Auctions, Users, Orders, Disputes, Support, Backoffice, Payouts): replace silent success / local error state with `toast.success(...)` / `toast.error(...)` from sonner (Toaster already mounted in App.tsx).
- Keep `ErrorAlert` for page-load fetch failures (persistent banner is right there); use toasts for mutation feedback and secondary fetch refreshes.

## 4. UI adjustments (mobile)

- **AI-smell leftovers**: grep-sweep for remaining `!` titles/marketing filler; unify remaining "GadgetBid" vs "Gadget Bidding" naming in UI strings.
- **Loading/error states**: standardize on a shared `ScreenStates` component (loading spinner, error state with Retry button, empty state) — check if one exists already (components like EmptyState); apply to Home, Search, Category, Wallet, MyBids, Notifications screens that currently render blank/partial on failure.
- **Visual polish (bounded consistency pass)**: consistent screen-header padding/back behavior, consistent list-item spacing, consistent pull-to-refresh where lists exist. No redesign — only normalization. Anything subjective beyond that gets flagged, not changed.

## Order of execution & verification

1. Backend audit filters (+ typecheck `pnpm --filter backend tsc`)
2. Mobile toast migration + error log + session fix (+ `tsc --noEmit`)
3. Admin filters UI + sonner (+ `tsc --noEmit`)
4. UI sweep (+ typecheck)

No DB migration needed (AuditLog schema unchanged). No new npm dependencies. Existing tests/scripts untouched.