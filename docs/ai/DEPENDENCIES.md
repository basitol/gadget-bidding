# Dependencies

The approved dependency list. If a package is not here, don't add it without asking — and never install a package you haven't confirmed exists on npm with the exact name.

## Rules

1. **Ask first** before adding any runtime dependency. State: package, version, which workspace, why the existing stack can't do it.
2. **Mobile native modules are expensive.** Anything with native code (not pure JS) forces a new dev build and EAS build, and crashes older dev builds / Expo Go on import. Prefer RN core or an already-installed Expo module. If one is unavoidable, load it behind `requireOptionalNativeModule` (see DECISIONS.md › Mobile).
3. **Expo packages:** install with `npx expo install <pkg>` from `packages/mobile` so the version matches SDK 54. Never hand-pick an Expo module version.
4. **Use pnpm only** (`pnpm@10.26.1`, pinned in root `package.json`). Never `npm install` or `yarn` — it breaks the lockfile and workspace links.
5. **Shared code goes in `packages/shared`**, not copied between packages. Web does not consume shared.
6. **Don't upgrade majors in passing** (Prisma 7, Express 4, React 18 in admin, React 19/RN 0.81 in mobile, Astro 6, Tailwind 4). A major upgrade is its own task.

## What's already there — use these, don't add alternatives

| Need | Use | Don't add |
| --- | --- | --- |
| HTTP client | `axios` (mobile, backend); `fetch` (admin) | got, ky, superagent |
| State (mobile) | `zustand` | redux, mobx, jotai, react-query |
| Animation (mobile) | RN `Animated` + `useNativeDriver` | reanimated, lottie, moti |
| Icons | `@expo/vector-icons` (mobile), `lucide-react` (admin) | other icon sets |
| Blur / glass | `expo-blur`, `expo-linear-gradient` | react-native-blur |
| Clipboard | RN core `Clipboard` | expo-clipboard |
| Network status | `networkStore` (own) | @react-native-community/netinfo |
| Secure storage | `expo-secure-store` (tokens), AsyncStorage (non-secret) | react-native-keychain |
| Realtime | `socket.io` / `socket.io-client` | ws, pusher |
| Jobs | the single 30 s `setInterval` tick in `backend/src/jobs/auction.job.ts` — add a step there | agenda, bree, node-cron, a second scheduler |
| Validation (backend) | `express-validator`, hand-written service checks | zod, joi, yup |
| ORM / DB | Prisma 7 + `@prisma/adapter-pg` + `pg` for raw SQL | typeorm, knex, sequelize |
| Logging | `winston` + `morgan` | pino, bunyan |
| Email | `resend` | nodemailer, sendgrid |
| SMS | Termii over `axios` | twilio |
| Payments | Paystack over `axios` (Monnify code exists) | flutterwave SDK, stripe |
| Images | `cloudinary` (prod), `multer` (upload), local disk in dev | sharp, aws-sdk |
| Admin UI | shadcn (`radix-ui`), Tailwind 4, `sonner`, `class-variance-authority` | MUI, Chakra, antd |
| Web landing | Astro 6, scoped CSS, `gsap`, `three` | Tailwind, React islands |
| Error tracking | `@sentry/react-native` (mobile) | bugsnag, crashlytics |

## Approved lists by workspace

### backend (`@gadget-bidding/backend`)
Runtime: `@gadget-bidding/shared`, `@prisma/adapter-pg`, `@prisma/client`, `@prisma/client-runtime-utils`, `@socket.io/redis-adapter`, `axios`, `bcrypt`, `bull`, `cloudinary`, `cors`, `dotenv`, `express`, `express-rate-limit`, `express-validator`, `helmet`, `jsonwebtoken`, `morgan`, `multer`, `pg`, `redis`, `resend`, `socket.io`, `winston`.
Dev: `prisma`, `jest`, `ts-jest`, `ts-node`, `nodemon`, `typescript`, `@types/*`.

Installed but unused (don't start using them casually — each needs a design decision):
- `bull` — no queues exist; all background work is the `auction.job.ts` interval.
- `@socket.io/redis-adapter` — sockets run on one instance with in-memory maps; Redis is only pinged for health.
- `crypto@^1.0.1` — deprecated npm placeholder; `require('crypto')` resolves to Node's built-in.

### mobile
Expo SDK `~54.0.33`, `react-native 0.81.5`, `react 19.1.0`.
Runtime: `@expo-google-fonts/inter`, `@expo/vector-icons`, `@gadget-bidding/shared`, `@react-native-async-storage/async-storage`, `@react-native-google-signin/google-signin` (lazy-loaded), `@react-navigation/{native,native-stack,bottom-tabs}`, `@sentry/react-native`, `axios`, `expo-*` (apple-authentication, auth-session, blur, build-properties, camera (lazy-loaded), constants, crypto, dev-client, document-picker, font, image-manipulator, image-picker, linear-gradient, notifications, secure-store, status-bar, updates, web-browser), `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-screens`, `react-native-webview`, `socket.io-client`, `zustand`.
Dev: `@sentry/cli`, `@types/react`, `typescript`.

### admin-dashboard
Runtime: `@gadget-bidding/shared`, `@fontsource-variable/geist`, `@tailwindcss/vite`, `class-variance-authority`, `clsx`, `lucide-react`, `next-themes`, `radix-ui`, `react`, `react-dom`, `react-router-dom`, `shadcn`, `socket.io-client`, `sonner`, `tailwind-merge`, `tailwindcss`, `tw-animate-css`.
Dev: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/*`.

### web
Runtime: `astro`, `gsap`, `three`, `@fontsource/{sora,manrope,jetbrains-mono}`.

### shared
No runtime dependencies. Keep it that way — it's consumed by Node, RN and the browser.

### root
Dev only: `eslint` 8 + `@typescript-eslint/*` + `eslint-config-prettier`, `prettier` 3, `typescript`, `@types/pg`.
