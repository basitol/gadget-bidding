// Data + style bindings for the landing design export ({{...}} placeholders in the paste).
import { heroAuction, naira } from './heroAuction';
import { formatCountdown } from './auctions';

export const deviceSrc = (kind: string) => `/img/devices/${kind === 'console' ? 'gamepad' : kind}.svg`;
export const iconSrc = (kind: string) => `/img/icons/${kind}.png`;

// Hero feed ({{feed}}: f.cls, f.av, f.init, f.who, f.amt)
const AV_BASE =
  'width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font: 700 10px Manrope, sans-serif';
export const avStyle = (top: boolean) =>
  `${AV_BASE}; ${top ? 'background: #3366FF; color: #FFFFFF' : 'background: #EEF3FF; color: #4A5878'}`;
export const initials = (h: string) => h.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase();

export const feed = ['tk_gadgets', 'jide_o', 'ade.lo'].map((who, i) => ({
  cls: '',
  av: avStyle(i === 0),
  init: initials(who),
  who,
  amt: naira(heroAuction.price - heroAuction.step * i),
}));

export const hero = {
  bidCount: heroAuction.count,
  heroClock: formatCountdown(heroAuction.clock),
  heroPrice: naira(heroAuction.price),
  heroNext: naira(heroAuction.price + heroAuction.step),
};

export const guarantees = [
  { kind: 'shield', title: 'Payments by Paystack', sub: 'Held in escrow until delivery' },
  { kind: 'idcard', title: 'CAC-verified sellers', sub: 'Registered businesses only' },
  { kind: 'phonecheck', title: 'IMEI checked', sub: 'No stolen or blocked devices' },
  { kind: 'box', title: 'Inspected at our hub', sub: 'Computer Village, Ikeja' },
];

export const webCards = [
  { kind: 'phone', t: 'iPhone 15 Pro', p: '₦845,000' },
  { kind: 'laptop', t: 'MacBook Air M2', p: '₦910,000' },
  { kind: 'headphones', t: 'Sony XM5', p: '₦198,500' },
  { kind: 'gamepad', t: 'PS5 Slim', p: '₦520,000' },
  { kind: 'watch', t: 'Watch Series 9', p: '₦265,000' },
  { kind: 'phone', t: 'Galaxy S24 Ultra', p: '₦1,150,000' },
];

// Live auctions ({{c.badge}}, {{k.style}})
const BADGE_BASE =
  'position: absolute; top: 10px; left: 10px; height: 22px; padding: 0 8px; border-radius: 999px; font: 700 11px Manrope, sans-serif; display: inline-flex; align-items: center; font-variant-numeric: tabular-nums';
export const badgeStyle = (seconds: number) =>
  `${BADGE_BASE}; ${seconds < 3600 ? 'background: #FF7A1A; color: #170A02' : 'background: #FFFFFF; color: #0B1220'}`;

const CAT_BASE =
  'display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 16px 18px; border: 0; border-bottom: 1px solid #E6EAF2; text-align: left; cursor: pointer';
export const catStyle = (on: boolean) =>
  `${CAT_BASE}; ${on ? 'background: #F7F8FB; box-shadow: inset 3px 0 0 #3366FF' : 'background: #FFFFFF'}`;

export const steps = [
  {
    n: '01 · SELLER',
    kind: 'idcard',
    title: 'Verified businesses only',
    body: 'Every seller is a registered Computer Village business. We check their CAC details and ID before they can list.',
    rows: [
      { k: 'CAC registration', v: 'MATCHED' },
      { k: 'Owner ID', v: 'VERIFIED' },
      { k: 'Shop address', v: 'CONFIRMED' },
    ],
  },
  {
    n: '02 · LISTING',
    kind: 'camera',
    title: 'Every listing reviewed',
    body: 'Our team checks the photos, grade and IMEI before an auction goes live. Stock photos and stolen devices never make it.',
    rows: [
      { k: 'Real photos', v: 'CHECKED' },
      { k: 'IMEI / serial', v: 'CLEAN' },
      { k: 'Grade matches', v: 'YES' },
    ],
  },
  {
    n: '03 · INSPECTION',
    kind: 'box',
    title: 'Inspected at our hub',
    body: 'After you win, the seller drops it at our Computer Village hub. We test it against the listing, then deliver it to you.',
    rows: [
      { k: 'Powers on', v: 'PASS' },
      { k: 'Screen & body', v: 'PASS' },
      { k: 'Battery health', v: '96%' },
    ],
  },
];

// Protection timeline ({{t.dot}}, {{t.line}}, {{t.titleStyle}})
type State = 'done' | 'now' | 'todo';
const DOT_BASE = 'width: 14px; height: 14px; flex-shrink: 0; border-radius: 50%; box-sizing: border-box; margin-top: 3px';
const dot: Record<State, string> = {
  done: `${DOT_BASE}; background: #22A55B`,
  now: `${DOT_BASE}; background: #FFFFFF; border: 2px solid #3366FF; box-shadow: 0 0 0 4px #EEF3FF`,
  todo: `${DOT_BASE}; background: #FFFFFF; border: 2px solid #E2E8F3`,
};
const titleStyle: Record<State, string> = {
  done: 'font-size: 15px; font-weight: 700; color: #0B1220',
  now: 'font-size: 15px; font-weight: 700; color: #1F4FE6',
  todo: 'font-size: 15px; font-weight: 600; color: #4A5878',
};
const rawTrack: { state: State; title: string; sub: string }[] = [
  { state: 'done', title: 'You pay with Paystack', sub: 'Money held in escrow' },
  { state: 'done', title: 'Seller drops it at our hub', sub: 'Computer Village' },
  { state: 'now', title: 'Inspected by Gadgets Bidding', sub: 'Matches the listing' },
  { state: 'todo', title: 'Delivered to you', sub: 'Anywhere in Lagos' },
  { state: 'todo', title: 'Seller gets paid', sub: 'After you confirm' },
];
export const track = rawTrack.map((t, i) => ({
  ...t,
  dot: dot[t.state],
  line:
    i === rawTrack.length - 1
      ? 'display: none'
      : `width: 2px; flex: 1; min-height: 16px; margin: 2px 0; background: ${t.state === 'done' ? '#22A55B' : '#E2E8F3'}`,
  titleStyle: titleStyle[t.state],
}));
