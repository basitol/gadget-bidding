# Gadgets Bidding — Design Guide

**Source of truth for every surface (mobile app, admin dashboard, web, emails). Follow exactly.**
Supersedes `design/amber-ledger.md`. Reuse these pieces before inventing anything new.

---

## 1. Foundations

### Colour
Soft and calm, with one blue for action. Status colours are always a light tint with dark text.

**Brand**
| Token | Hex | Use |
|---|---|---|
| Blue 500 | `#4F7BFF` | Primary buttons, links, focus, selected states |
| Blue 600 | `#3E6AF0` | Pressed, link text on tint |
| Blue 50 | `#F1F5FF` | Selected rows, info notes |
| Violet | `#9B87F5` | Seller accents, KYB, gradient end |

**Text & surfaces**
| Token | Hex | Use |
|---|---|---|
| Ink | `#1C1F2A` | Headings, body text, amounts |
| Slate | `#5C6273` | Secondary text, labels |
| Muted | `#7C8293` | Hints, timestamps (never prices or actions) |
| Faint | `#A9AEBB` | Placeholders, disabled |
| Line | `#EDEFF4` | Borders, dividers |
| Fill | `#F5F6F9` | Quiet chips, input wells |
| Canvas | `#F6F7FA` | Page background under glass |
| White | `#FFFFFF` | Cards (becomes glass on blobs) |

**Status — always tint + dark text**
| Status | Tint | Text | Use |
|---|---|---|---|
| Paid · Passed | `#EEF9F2` | `#2E9E5E` | Success, money released, verified |
| Ending soon · Due | `#FFF6EE` | `#DB7A2E` | Needs attention, deadlines, held |
| Failed · Outbid | `#FDF0F2` | `#D9536A` | Errors, destructive, rejected |
| In review · Live | `#F1F5FF` | `#3E6AF0` | In progress, information |
| Seller · Refunded | `#F5F2FF` | `#7C68E8` | Seller identity, refunds |
| Support · Auctions | `#E6F7F7` | `#0E8B8A` | Support, live auction tools |

- **Do:** one bright blue action per screen. Show status with a tinted chip plus a word.
- **Don't:** use colour alone to mean something, or put two primary buttons side by side.

### Type
Satoshi throughout. Sizes below are the app; admin uses the same scale one step larger for page titles.

| Style | Spec | Use |
|---|---|---|
| Display | 500 · 32px · -0.02em | Big amounts, hero numbers |
| Title 1 | 500 · 26px · -0.02em | Screen titles (app), page H1 (admin is 30px) |
| Title 2 | 500 · 19px · -0.01em | Section and card titles |
| Body | 400 · 16px · 0 · line-height 1.5 | Paragraphs, list text |
| Label | 500 · 14px · 0 | Field labels, menu items, chips |
| Caption | 400 · 13px · 0 | Timestamps, hints, footnotes |
| Overline | 500 · 13px · caps · 0.04em | Group headings inside a screen |

- **Do:** Satoshi for everything. Two weights only: Regular (400) for reading, Medium (500) for anything you scan. Numbers use tabular figures so prices don't jump.
- **Don't:** bold paragraphs, all-caps sentences, or more than three sizes on one screen.

### Spacing — 4px grid, these steps only
`4` icon gaps · `8` chip gaps · `12` list gaps · `16` card padding · `20` app screen edge · `24` admin panel padding · `32` between sections · `48` page margins

### Corners — bigger things rounder; nested always smaller than container
`8` chips, small tags · `10` admin buttons · `12` inputs (admin), icon tiles · `14` app buttons & inputs · `18` app cards · `24` admin section cards · `28` admin panel, sheets

### Elevation & glass
- **Level 0** — flat on the page, 1px Line border. Inputs, table rows.
- **Level 1** — cards: `0 1px 2px rgba(20,28,60,.04), 0 6px 16px rgba(20,28,60,.05)`
- **Glass** — White 56% · blur 22 · saturate 170% · 1px white 75% border. Only on cards with radius 16+ sitting on the blob background. Never in emails, never on text-heavy legal pages.
- **Blobs** — four soft radial colours (blue, violet, teal, amber) behind app screens and the admin page.

---

## 2. Components

### Buttons
One primary per screen. Secondary for the other choice. Red outline only for things that remove or stop something.

- **App:** 52px tall, radius 14, full width in footers. Variants: Primary (Blue 500 fill, white text) · Secondary (white, Ink text) · Destructive (white, red outline + red text) · Disabled (Fill bg, Faint text).
- **Admin:** 42 / 40 / 36px heights, radius 10. Primary, ghost/secondary, red-outline destructive.
- **Labels start with a verb and say what happens:** "Approve and send", "Send reset link". Never "Submit", "OK" or "Proceed".
- Disabled buttons stay visible; the reason is shown next to them.

### Inputs
Big, labelled and forgiving. 52px tall in the app (radius 14); admin radius 12.
- States: Default (Line border) · Focused (Blue 500 border) · Error (red border + written message below, e.g. "Use a @gadgetsbidding.com address.").
- OTP: 6-digit code, individual boxes, active box outlined blue.
- **Do:** label above every field. Validate when the person leaves the field; clear the error as soon as they fix it.
- **Don't:** use placeholder text as the label, or show errors while someone is still typing.

### Chips, toggles & tabs
- Chips show **status, never actions**. 30px tall, radius 9, tint + dark text (see status table). Neutral chip ("Draft") uses Fill + Ink.
- Toggle: Blue 500 when on, Line/grey when off. `role="switch"`.
- Tabs: underlined (Blue 500 underline on active, Ink text; inactive Muted). Show a count when it helps.
- Checkbox: Blue 500 fill with white check; label says what it confirms.

### Cards
- **Section card (admin):** icon tile (radius 12), title (Title 2), one-line description, then content (key/value rows separated by Line).
- **Stat card:** icon tile + label, Display amount (e.g. ₦86.4M), Caption explanation.
- **Item card (app):** thumbnail, title ("iPhone 15 Pro · 256 GB"), "Verified seller CV-1042" caption, price in Ink Medium.

### Feedback
Tell people what happened in plain words, in the colour that matches the outcome.
- **Notes & banners:** tinted background + dark text (green success, amber warning, neutral Fill for info/privacy).
- **Confirm before anything risky:** red-tint dialog, title as a question ("Suspend Ngozi Eze?"), body says what happens and what stays; ask for a reason if it goes in the audit log. Buttons: Cancel (secondary) + action verb (red).
- **Timeline:** green filled dots for done, blue ring for current (blue text), faint ring for upcoming. Each step: label + Caption sub-line.

---

## 3. Patterns

### Layout — three surfaces, one system
**Mobile app · 390 × 844**
- 20px screen edges; 14–16px between cards.
- Header: back, title centred, one action on the right.
- Footer actions sit in a frosted bar above the home indicator.
- Buyer tabs: Home · Explore · Watchlist · My bids · Profile.
- Seller tabs: Home · Listings · Payouts · Store. No buying from a seller account.

**Admin · 1440 wide**
- Blue rail (58px icons) → sidebar (Main, Queues, Settings) → white panel, radius 28.
- Header: breadcrumb left; Team · Settings · Search right.
- Pages stack: sub-nav pills → stats → tabs → section cards.
- Detail pages: header card (chips, title, facts, actions) then a 60/40 two-column grid.
- Money and Team areas use pill sub-nav to jump between sibling pages.

**Emails · 680 wide**
- Subject and preview text written first.
- Logo, one icon, one heading, one button.
- No glass or blur. Plain tables for money.
- Footer says why they got it and never asks for a password or PIN.

### Voice & formats — write like a helpful person at the hub counter
- **Plain words.** "Your money sits in escrow" not "Funds are held pending fulfilment".
- **Say what happens next** in every success and error.
- **Buttons start with a verb** and match the result: "Send reset link".
- **Never blame.** "That code didn't match" not "You entered an invalid code".
- **Money:** ₦ with commas, no kobo: ₦1,284,800. Negative: −₦75,200.
- **Dates:** Nov 24, 2026 · 6:00 pm. "Today" and "Yesterday" when recent.
- **IDs:** orders GV-20972, payouts PO-11429, refunds RF-2041, cases D-115, sellers CV-1042.
- **Privacy:** buyers see "Verified seller CV-xxxx"; sellers never see buyer names.

### Motion — small, quick, purposeful; explains what changed, never decoration
| Duration | Name | Use |
|---|---|---|
| 150ms | Fast | Taps, toggles, chip changes |
| 250ms | Normal | Sheets, tabs, screen slides |
| 400ms | Slow | Wins and celebrations only |

- Ease-out to enter, ease-in to leave. Animate only position, size and opacity.
- With "reduce motion" on, everything becomes a quick fade.
- Where it matters most: price ticking up on a new bid, the outbid flash, countdown turning orange under 1 minute, the win celebration, the order timeline filling in.
- Admin stays quiet — row flashes on new bids and smooth panel reveals only.

### Accessibility — the minimum for every screen
- Touch targets at least 44 × 44px; app buttons are 52px.
- Text contrast at least 4.5:1 — Muted grey is for hints only, never for prices or actions.
- Every input has a visible label; errors are written, not just red.
- Status always has a word, not just a colour.
- Visible focus ring (2px blue) on everything you can tab to.
- Switches use `role="switch"`; checkboxes say what they confirm.
