# Handover

Living state of the work. **Read at the start of every session; update before you stop.** Keep it short — replace stale lines, don't append a diary. Long-term reasoning goes in [DECISIONS.md](DECISIONS.md); cross-session detail is also in Context Engine memory (`session_recall("<topic>")`).

_Last updated: 2026-11-28_

## Where things are

- **Branch:** `feat/buyer-app-revamp`. Local commits `fab1297` and the docs commit are not pushed yet. Other local branches: `feat/admin-dashboard-match-login`, `claude/keen-matsumoto-0998eb` (its useful commit was cherry-picked; treat as stale).
- **Last feature commit:** `fab1297` — seller listing management, hub drop-off/rider flow, automatic listing pause.
- **Checks at that commit:** backend, admin and mobile type-checks pass. Backend lint still has its 2 known errors (BUGS.md). Not run: the new migrations against a DB, or the flows end to end.

## In progress

Seller hub screens on mobile: `screens/sell/hub/index.ts` registers no screens yet (`hubScreens = []`), and `services/sellerHub.service.ts` was just added. The backend hub routes (`/seller/hub`, `/admin/hub`) are wired. Another session may still be working on this. Check `git status` before you edit these files.

## Just finished

- `fab1297`: manage live listings (edit, end, end early, relist, bidder note and photos the team checks first), hub drop-off or rider booking, choices after a failed hub check, shared buyer refunds (`order/buyerRefund.service.ts`), automatic listing pause with seller review request and admin lift. Migrations `20261128170000_listing_manage_and_hub` and `20261128173000_listing_pause_cleared`.
- AI context docs in `docs/ai/` (this folder), linked from `CLAUDE.md` / `AGENTS.md`.

## Next up

See [ROADMAP.md](ROADMAP.md). Top of the list: build the mobile hub screens, apply the two migrations locally (`pnpm db:migrate`) and walk the hub and manage flows. Then the open risks in BUGS.md.

## Gotchas for the next session

- Several sessions may share this checkout. `git status` before you start; leave files you didn't touch alone.
- Run Redis locally — the backend won't start without it.
- Physical iPhone needs a dev build (Expo Go on device is SDK 58; the app is SDK 54).
- Paystack test mode: only 3 real bank-account resolves per day; test bank code `001` resolves anything.
- The local Termii key is live — dev code avoids sending SMS; keep it that way.
- `SETUP.md`, `README.md` and `docs/launch-checklist.md` are partly stale (BUGS.md › Open).
