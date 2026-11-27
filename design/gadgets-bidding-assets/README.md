# Gadgets Bidding — asset pack (v1, Nov 2026)

## What's inside

| Folder | Files | Use |
|---|---|---|
| `brand/` | `logo-wordmark.svg`, `logo-wordmark-on-dark.svg`, `logo-mark.svg` + PNGs (@1x/@2x/@3x, mark 256/512/1024) | Logo. SVGs are outlined (no font needed). |
| `app-icon/` | iOS 1024, Play Store 512, Android adaptive foreground (432 + SVG, background `#3366FF`), PWA 192/512 + maskable 512, apple-touch 180, favicon 16/32/48 + `.ico` + `.svg` | Stores, home screen, browser tab |
| `splash/` | iOS 1290×2796, Android 1080×1920 | Launch screen (background `#F6F7FA`) |
| `social/` | `og-image-1200x630.png`, `profile-picture-800.png` | Link previews, Instagram/X/WhatsApp profile |
| `email/` | `email-logo@2x.png` (show at 180×39) | Header of every email |
| `icons-3d/` | 12 icons, 256×256 PNG | Stat cards, empty states, emails (shield, idcard, phonecheck, box, gavel, bell, autobid, truck, tag, store, wallet, camera) |
| `devices/` | phone, laptop, headphones, gamepad, watch (SVG) | Placeholders until real product photos load; category tiles |
| `ui-icons/` | 37 line icons, 24px, `stroke="currentColor"`, 1.8 stroke | Menus, nav, buttons |
| `third-party/` | Google "G", Apple logo (black + white) | Sign in with Google / Apple buttons only |
| `tokens/` | `tokens.json`, `tokens.css`, `tailwind-theme.css` | Colours, type, spacing, radius, shadow, glass, motion |

## Fonts (download, not bundled)
- **Satoshi** (all UI) — free from Fontshare: fontshare.com/fonts/satoshi. Use 400, 500, 700.
- **Outfit 700** — only used inside the logo, which is already outlined. You only need it if you redraw the logo.

## Still needed (you have to source these)
1. **Real product photos** — sellers upload these; set a minimum of 4 photos, 1200px, 4:3.
2. **Paystack badges** — use Paystack's official "Secured by Paystack" badge from their brand kit, not a redraw.
3. **App Store / Play Store screenshots** — export from the canvas once screens are final (6.7" and 5.5" iPhone, Android phone).
4. **Confetti / win animation** — can be CSS (see Motion section on the canvas) or a small Lottie file.
5. **Legal sign-off** on terms and privacy text.

## Rules
- Keep clear space around the logo equal to the height of the "B".
- Minimum wordmark width: 96px. Below that use the mark.
- Don't recolour the logo except the provided on-dark version.
- Google and Apple logos must follow their own brand guidelines.
