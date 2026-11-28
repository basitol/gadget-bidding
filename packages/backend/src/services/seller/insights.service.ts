import prisma from '../../config/prisma';

/**
 * Sales insights for the seller app (Store › Sales insights): what they earned, sold and how many
 * people looked, for a period, against the same length of time just before it.
 *
 * - Earned / items sold: orders the buyer confirmed (or we confirmed for them) in the period, paid
 *   and not refunded. Earned is what the seller gets after our fee (orders.seller_payout).
 * - Sell-through: auctions that ended in the period with a winner ÷ all auctions that ended.
 * - Listing views: auction_view_days (counted when someone other than the seller opens a listing).
 * - The tip compares bids by the Lagos time an auction ended, over the last 12 months, and only
 *   shows when each side has at least 3 auctions and the difference is worth saying.
 */

export const INSIGHT_PERIODS = ['30d', '6m', '1y'] as const;
export type InsightPeriod = (typeof INSIGHT_PERIODS)[number];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Lagos is UTC+1 all year. */
const LAGOS_OFFSET = HOUR;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const num = (v: unknown) => (v == null ? 0 : Number(v.toString()));
const round1 = (n: number) => Math.round(n * 10) / 10;

/** The Lagos wall clock of an instant, read with getUTC*(). */
const lagosClock = (d: Date) => new Date(d.getTime() + LAGOS_OFFSET);
/** The instant of Lagos midnight on y-m-d (month/day may overflow either way). */
const lagosMidnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - LAGOS_OFFSET);
/** The Lagos calendar date of an instant, as a DATE column value (UTC midnight). */
const lagosDate = (d: Date) => {
  const l = lagosClock(d);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()));
};
const dayLabel = (d: Date) => {
  const l = lagosClock(d);
  return `${MONTHS[l.getUTCMonth()]} ${l.getUTCDate()}`;
};

type Bar = { label: string; from: Date; to: Date };

/**
 * The period and its chart bars.
 * - 30d: the last 30 Lagos days (today included), as 5 bars of 6 days, so the bars add up to the total.
 * - 6m / 1y: calendar months, this one included (6 or 12 bars).
 */
const periodOf = (period: InsightPeriod, now: Date): { from: Date; bars: Bar[] } => {
  const l = lagosClock(now);
  const [y, m, d] = [l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()];
  if (period === '30d') {
    const bars = Array.from({ length: 5 }, (_, i) => {
      const from = lagosMidnight(y, m, d - 29 + 6 * i);
      const to = i === 4 ? now : lagosMidnight(y, m, d - 29 + 6 * (i + 1));
      return { label: dayLabel(from), from, to };
    });
    return { from: bars[0].from, bars };
  }
  const n = period === '6m' ? 6 : 12;
  const bars = Array.from({ length: n }, (_, i) => {
    const from = lagosMidnight(y, m - (n - 1) + i, 1);
    const to = i === n - 1 ? now : lagosMidnight(y, m - (n - 1) + i + 1, 1);
    return { label: MONTHS[lagosClock(from).getUTCMonth()], from, to };
  });
  return { from: bars[0].from, bars };
};

/** Whole-number % change, or null when there's nothing to compare with. */
const changePct = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/* ---------------- What sells best: group by device family ---------------- */

const FAMILY_BY_PROFILE: Record<string, string> = {
  iphone_new: 'iPhones',
  iphone_old: 'iPhones',
  samsung: 'Samsung phones',
  android: 'Android phones',
  ipad: 'iPads',
  android_tablet: 'Android tablets',
  macbook_as: 'MacBooks',
  macbook_intel: 'MacBooks',
  windows_laptop: 'Windows laptops',
  desktop_pc: 'Desktop PCs',
  console: 'Consoles',
  handheld: 'Handheld consoles',
  vr_headset: 'VR headsets',
  smart_glasses: 'Smart glasses',
  vision_pro: 'Vision Pro',
  apple_watch: 'Apple Watches',
  smartwatch: 'Smartwatches',
  drone: 'Drones',
  camera: 'Cameras',
};

/** For listings from before device profiles: the model name says what it is. */
const FAMILY_BY_TEXT: [RegExp, string][] = [
  [/\biphone\b/i, 'iPhones'],
  [/\bipad\b/i, 'iPads'],
  [/\bmacbook\b/i, 'MacBooks'],
  [/\bairpods\b/i, 'AirPods'],
  [/\bapple watch\b/i, 'Apple Watches'],
  [/\bvision pro\b/i, 'Vision Pro'],
  [/\bgalaxy tab\b/i, 'Android tablets'],
  [/\bgalaxy (watch|fit)\b/i, 'Smartwatches'],
  [/\bgalaxy buds\b/i, 'Headphones'],
  [/\bgalaxy\b/i, 'Samsung phones'],
  [/\b(pixel|tecno|infinix|itel|redmi|xiaomi|oneplus|oppo|vivo|nokia)\b/i, 'Android phones'],
  [/\b(playstation|ps[45]|xbox)\b/i, 'Consoles'],
  [/\b(switch|steam deck|rog ally)\b/i, 'Handheld consoles'],
  [/\b(quest|vr)\b/i, 'VR headsets'],
  [/\b(dji|drone)\b/i, 'Drones'],
  [/\b(headphones?|earbuds|wh-\d|bose|beats)\b/i, 'Headphones'],
];

type GadgetBits = {
  title: string;
  brand: string | null;
  model: string | null;
  specifications: unknown;
  category: { name: string } | null;
} | null;

const familyOf = (g: GadgetBits) => {
  if (!g) return 'Other';
  const text = [g.title, g.brand, g.model].filter(Boolean).join(' ');
  const profile = (g.specifications as { profile?: string } | null)?.profile;
  if (profile === 'audio') return /\bairpods\b/i.test(text) ? 'AirPods' : 'Headphones';
  if (profile && FAMILY_BY_PROFILE[profile]) return FAMILY_BY_PROFILE[profile];
  const hit = FAMILY_BY_TEXT.find(([re]) => re.test(text));
  return hit?.[1] ?? g.category?.name ?? 'Other';
};

/* ---------------- The tip: when do auctions end best? ---------------- */

/** Lagos hours [from, to) and how the window reads in "ending …". */
const WINDOWS = [
  { key: 'morning', from: 6, to: 12, phrase: 'in the morning' },
  { key: 'afternoon', from: 12, to: 17, phrase: 'in the afternoon' },
  { key: 'early_evening', from: 17, to: 20, phrase: 'between 5 and 8 pm' },
  { key: 'evening', from: 20, to: 22, phrase: 'between 8 and 10 pm' },
  { key: 'night', from: 22, to: 30, phrase: 'late at night' },
] as const;
const MIN_PER_GROUP = 3;
/** Only worth saying when the best time gets at least this much more. */
const MIN_LIFT_PCT = 20;

const windowOf = (end: Date) => {
  const h = lagosClock(end).getUTCHours();
  const hour = h < 6 ? h + 24 : h;
  return WINDOWS.find(w => hour >= w.from && hour < w.to)!;
};

export const endTimeTip = (auctions: { endTime: Date; totalBids: number | null }[]) => {
  const groups = new Map<string, { phrase: string; n: number; bids: number }>();
  for (const a of auctions) {
    const w = windowOf(a.endTime);
    const g = groups.get(w.key) ?? { phrase: w.phrase, n: 0, bids: 0 };
    g.n++;
    g.bids += a.totalBids ?? 0;
    groups.set(w.key, g);
  }
  const usable = [...groups.values()].filter(g => g.n >= MIN_PER_GROUP).map(g => ({ ...g, avg: g.bids / g.n }));
  if (usable.length < 2) return null;
  usable.sort((a, b) => b.avg - a.avg);
  const best = usable[0];
  const worst = usable[usable.length - 1];
  if (worst.avg <= 0) return null;
  const lift = Math.round((best.avg / worst.avg - 1) * 100);
  if (lift < MIN_LIFT_PCT) return null;
  return {
    text: `Your auctions ending ${best.phrase} get ${lift}% more bids than ones ending ${worst.phrase}.`,
    best: { window: best.phrase, auctions: best.n, avg_bids: round1(best.avg) },
    compared_with: { window: worst.phrase, auctions: worst.n, avg_bids: round1(worst.avg) },
  };
};

/* ---------------- The whole screen ---------------- */

export const getSalesInsights = async (sellerId: string, period: InsightPeriod, now = new Date()) => {
  const { from, bars } = periodOf(period, now);
  // The same length of time, just before.
  const prevFrom = new Date(from.getTime() - (now.getTime() - from.getTime()));
  const yearAgo = new Date(now.getTime() - 365 * DAY);

  const [sold, ended, endedForTip, viewsNow, viewsBefore] = await Promise.all([
    prisma.order.findMany({
      where: {
        sellerId,
        paymentStatus: 'paid',
        buyerConfirmedAt: { gte: prevFrom, lte: now },
        disputes: { none: { outcome: 'refund' } },
      },
      select: {
        sellerPayout: true,
        totalAmount: true,
        deliveryFee: true,
        buyerConfirmedAt: true,
        auction: {
          select: {
            totalBids: true,
            gadget: {
              select: { title: true, brand: true, model: true, specifications: true, category: { select: { name: true } } },
            },
          },
        },
      },
    }),
    prisma.auction.findMany({
      where: { sellerId, status: 'ended', endTime: { gte: from, lte: now } },
      select: { winnerId: true },
    }),
    prisma.auction.findMany({
      where: { sellerId, status: 'ended', endTime: { gte: yearAgo, lte: now } },
      select: { endTime: true, totalBids: true },
    }),
    prisma.auctionViewDay.aggregate({
      where: { auction: { sellerId }, day: { gte: lagosDate(from), lte: lagosDate(now) } },
      _sum: { views: true },
    }),
    prisma.auctionViewDay.aggregate({
      where: { auction: { sellerId }, day: { gte: lagosDate(prevFrom), lt: lagosDate(from) } },
      _sum: { views: true },
    }),
  ]);

  const inPeriod = sold.filter(o => o.buyerConfirmedAt! >= from);
  const before = sold.filter(o => o.buyerConfirmedAt! < from);
  const earned = inPeriod.reduce((s, o) => s + num(o.sellerPayout), 0);
  const earnedBefore = before.reduce((s, o) => s + num(o.sellerPayout), 0);

  const families = new Map<string, { sold: number; total: number }>();
  for (const o of inPeriod) {
    const key = familyOf(o.auction?.gadget ?? null);
    const f = families.get(key) ?? { sold: 0, total: 0 };
    f.sold++;
    f.total += num(o.totalAmount) - num(o.deliveryFee);
    families.set(key, f);
  }
  const bestSellers = [...families.entries()]
    .map(([label, f]) => ({ label, sold: f.sold, avg_price: Math.round(f.total / f.sold) }))
    .sort((a, b) => b.sold - a.sold || b.avg_price * b.sold - a.avg_price * a.sold)
    .slice(0, 4);

  const withWinner = ended.filter(a => a.winnerId).length;
  const views = viewsNow._sum.views ?? 0;
  const viewsPrev = viewsBefore._sum.views ?? 0;

  return {
    period,
    from: from.toISOString(),
    to: now.toISOString(),
    earned: { amount: Math.round(earned), previous: Math.round(earnedBefore), change_pct: changePct(earned, earnedBefore) },
    items_sold: { count: inPeriod.length, previous: before.length, change: inPeriod.length - before.length },
    sell_through: {
      pct: ended.length ? Math.round((withWinner / ended.length) * 100) : null,
      sold: withWinner,
      ended: ended.length,
    },
    views: { count: views, previous: viewsPrev, change_pct: changePct(views, viewsPrev) },
    /** Earnings after fees per bar (naira). The last bar is the one to highlight. */
    chart: bars.map((b, i) => ({
      label: b.label,
      from: b.from.toISOString(),
      to: b.to.toISOString(),
      amount: Math.round(
        inPeriod
          .filter(o => o.buyerConfirmedAt! >= b.from && (o.buyerConfirmedAt! < b.to || i === bars.length - 1))
          .reduce((s, o) => s + num(o.sellerPayout), 0)
      ),
    })),
    best_sellers: bestSellers,
    avg_bids_per_sale: inPeriod.length
      ? round1(inPeriod.reduce((s, o) => s + (o.auction?.totalBids ?? 0), 0) / inPeriod.length)
      : null,
    tip: endTimeTip(endedForTip),
  };
};

export type SalesInsights = Awaited<ReturnType<typeof getSalesInsights>>;
