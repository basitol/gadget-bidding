import { BID_COMMITMENT_AMOUNT } from '@gadget-bidding/shared';
import prisma from '../../config/prisma';
import config from '../../config';
import {
  BIDDING_PAUSE_DAYS,
  CONFIRM_WINDOW_HOURS,
  DROPOFF_RULE,
  dropoffDueOf,
  inspectionPassed,
  MISSED_PAYMENT_LIMIT,
  MISSED_PAYMENT_LOOKBACK_DAYS,
  OFFER_WINDOW_HOURS,
  ORDER_PAYMENT_EXPIRY_HOURS,
} from '../order/order.service';
import { RETURN_WINDOW_DAYS } from '../buyer/case.service';
import { sellerCode } from '../buyer/sellerSummary.service';

/**
 * The admin Overview: headline numbers, the queues (sidebar and rail counts), 30 days of
 * daily sales / bids / sign-ups for the chart, and everything that needs someone's attention.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TZ = 'Africa/Lagos';
const SERIES_DAYS = 30;

/** How long each queue should take, matching what the apps tell people. */
export const REVIEW_TARGET_HOURS = {
  kyb: 24, // seller verification
  listing: 24, // new listing review
  dispute: 48, // "Usually decided within 2 working days"
  hub: 8, // "Check usually done today"
};

const toNumber = (v: unknown) => (v == null ? 0 : Number(String(v)));
const OPEN_DISPUTE = ['open', 'investigating'];

/** 00:00 today in Lagos, as a Date. */
const startOfLagosDay = (offsetDays = 0) => {
  const lagos = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const shift = Math.round((Date.now() - lagos.getTime()) / 60_000) * 60_000;
  lagos.setHours(0, 0, 0, 0);
  return new Date(lagos.getTime() + shift + offsetDays * DAY);
};

export const getQueueCounts = async (adminId?: string) => {
  const [kyb, listing, hub, disputes, live, payoutsReady, unread, reports] = await Promise.all([
    prisma.user.count({ where: { role: 'seller', sellerKybStatus: 'pending' } }),
    prisma.gadget.count({ where: { status: 'pending' } }),
    prisma.order.count({ where: { fulfillmentStatus: 'received_by_backoffice', paymentStatus: 'paid' } }),
    prisma.dispute.count({ where: { status: { in: OPEN_DISPUTE } } }),
    prisma.auction.count({ where: { status: 'active' } }),
    prisma.order.count({ where: { payoutStatus: 'ready', paymentStatus: 'paid' } }),
    adminId ? prisma.notification.count({ where: { userId: adminId, isRead: false } }) : Promise.resolve(0),
    prisma.listingReport.count({ where: { status: 'open' } }),
  ]);
  return {
    kyb,
    listing_review: listing,
    inspection_hub: hub,
    disputes,
    live_auctions: live,
    payouts_ready: payoutsReady,
    unread_notifications: unread,
    listing_reports: reports,
  };
};

type AttentionItem = {
  id: string;
  kind: 'kyb' | 'listing' | 'dispute' | 'hub' | 'payouts';
  queue: string;
  title: string;
  sub: string;
  due_at: string | null;
  route: string;
};

const dueFrom = (from: Date | null | undefined, hours: number) =>
  new Date((from ?? new Date()).getTime() + hours * HOUR).toISOString();

const money = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/** Where an order at the hub is with its check. */
const hubStep = (inspection: unknown) => {
  if (!inspection) return 'waiting for the check';
  if (inspectionPassed(inspection)) return 'passed the check, ready to leave';
  const i = inspection as { passed?: number; total?: number };
  return `didn't pass the check (${i.passed ?? 0} of ${i.total ?? 0})`;
};

/** Everything waiting on our team, soonest due first. */
export const getAttention = async (limit = 50) => {
  const [sellers, gadgets, disputes, hubOrders, payouts, awaitingDropoff] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'seller', sellerKybStatus: 'pending' },
      select: { id: true, fullName: true, businessName: true, sellerKybSubmittedAt: true, createdAt: true },
      orderBy: { sellerKybSubmittedAt: 'asc' },
      take: limit,
    }),
    prisma.gadget.findMany({
      where: { status: 'pending' },
      select: { id: true, title: true, brand: true, createdAt: true, seller: { select: { businessName: true, fullName: true } } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    }),
    prisma.dispute.findMany({
      where: { status: { in: OPEN_DISPUTE } },
      select: {
        id: true,
        caseNumber: true,
        description: true,
        createdAt: true,
        order: { select: { orderNumber: true, auction: { select: { gadget: { select: { title: true } } } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    }),
    prisma.order.findMany({
      where: { fulfillmentStatus: 'received_by_backoffice', paymentStatus: 'paid' },
      select: {
        id: true,
        orderNumber: true,
        updatedAt: true,
        inspection: true,
        auction: { select: { gadget: { select: { title: true } } } },
        events: { where: { kind: 'fulfillment', status: 'received_by_backoffice' }, select: { createdAt: true }, take: 1, orderBy: { createdAt: 'desc' } },
      },
      take: limit,
    }),
    prisma.order.aggregate({
      where: { payoutStatus: 'ready', paymentStatus: 'paid' },
      _sum: { sellerPayout: true },
      _count: true,
    }),
    // Paid, but the seller hasn't brought it to the hub yet (overdue ones are picked out below).
    prisma.order.findMany({
      where: { paymentStatus: 'paid', fulfillmentStatus: { in: ['pending', 'processing'] } },
      select: {
        id: true,
        orderNumber: true,
        sellerId: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        auction: { select: { gadget: { select: { title: true } } } },
        events: { where: { kind: 'payment', status: 'paid' }, select: { kind: true, status: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      },
      take: 200,
    }),
  ]);

  // Sellers who missed the drop-off deadline (6 pm the next working day after payment).
  const nowMs = Date.now();
  const overdueDropoffs = awaitingDropoff
    .map(o => ({ o, due: dropoffDueOf(o) }))
    .filter((x): x is { o: (typeof awaitingDropoff)[number]; due: Date } => !!x.due && x.due.getTime() < nowMs)
    .slice(0, limit);

  const items: AttentionItem[] = [
    ...sellers.map(s => ({
      id: `kyb-${s.id}`,
      kind: 'kyb' as const,
      queue: 'Seller KYB',
      title: s.businessName || s.fullName || 'New seller',
      sub: 'Business verification',
      due_at: dueFrom(s.sellerKybSubmittedAt ?? s.createdAt, REVIEW_TARGET_HOURS.kyb),
      route: `/sellers?kyb=pending&seller=${s.id}`,
    })),
    ...disputes.map(d => ({
      id: `dispute-${d.id}`,
      kind: 'dispute' as const,
      queue: 'Disputes',
      title: d.description.length > 48 ? `${d.description.slice(0, 47)}…` : d.description,
      sub: `Case D-${d.caseNumber} · ${d.order?.orderNumber ?? 'Order'}${d.order?.auction?.gadget?.title ? ` · ${d.order.auction.gadget.title}` : ''}`,
      due_at: dueFrom(d.createdAt, REVIEW_TARGET_HOURS.dispute),
      route: `/disputes?case=${d.id}`,
    })),
    ...gadgets.map(g => ({
      id: `listing-${g.id}`,
      kind: 'listing' as const,
      queue: 'Listing review',
      title: g.title,
      sub: `New listing · ${g.seller?.businessName || g.seller?.fullName || g.brand}`,
      due_at: dueFrom(g.createdAt, REVIEW_TARGET_HOURS.listing),
      route: `/gadgets?status=pending&gadget=${g.id}`,
    })),
    ...hubOrders.map(o => ({
      id: `hub-${o.id}`,
      kind: 'hub' as const,
      queue: 'Inspection hub',
      title: o.auction?.gadget?.title ?? 'Device at hub',
      sub: `Order ${o.orderNumber} · ${hubStep(o.inspection)}`,
      due_at: dueFrom(o.events[0]?.createdAt ?? o.updatedAt, REVIEW_TARGET_HOURS.hub),
      route: `/backoffice?order=${o.id}`,
    })),
    ...overdueDropoffs.map(({ o, due }) => ({
      id: `dropoff-${o.id}`,
      kind: 'hub' as const,
      queue: 'Inspection hub',
      title: o.auction?.gadget?.title ?? 'Paid order',
      sub: `Order ${o.orderNumber} · drop-off overdue · seller ${o.sellerId ? sellerCode(o.sellerId) : 'unknown'}`,
      due_at: due.toISOString(),
      route: `/orders?search=${encodeURIComponent(o.orderNumber)}`,
    })),
  ];

  if (payouts._count > 0) {
    items.push({
      id: 'payouts-ready',
      kind: 'payouts',
      queue: 'Payouts',
      title: `${payouts._count} payout${payouts._count === 1 ? '' : 's'} ready`,
      sub: `${money(toNumber(payouts._sum.sellerPayout))} to release`,
      due_at: startOfLagosDay(1).toISOString(),
      route: '/payouts?status=ready',
    });
  }

  items.sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''));
  return { total: items.length, items: items.slice(0, limit) };
};

type SeriesRow = { day: string; value: number };

const dailySeries = async () => {
  const since = startOfLagosDay(-(SERIES_DAYS - 1));
  // Stored timestamps are UTC without a zone; turn them into Lagos calendar days.
  const [gmv, bids, users] = await Promise.all([
    prisma.$queryRaw<SeriesRow[]>`
      SELECT to_char((e.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(o.total_amount), 0)::float8 AS value
        FROM order_events e JOIN orders o ON o.id = e.order_id
       WHERE e.kind = 'payment' AND e.status = 'paid' AND e.created_at >= ${since}
       GROUP BY 1`,
    prisma.$queryRaw<SeriesRow[]>`
      SELECT to_char((b.bid_time AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day,
             COUNT(*)::float8 AS value
        FROM bids b WHERE b.bid_time >= ${since}
       GROUP BY 1`,
    prisma.$queryRaw<SeriesRow[]>`
      SELECT to_char((u.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day,
             COUNT(*)::float8 AS value
        FROM users u WHERE u.created_at >= ${since}
       GROUP BY 1`,
  ]);
  const map = (rows: SeriesRow[]) => new Map(rows.map(r => [r.day, Number(r.value)]));
  const [g, b, u] = [map(gmv), map(bids), map(users)];
  return Array.from({ length: SERIES_DAYS }, (_, i) => {
    const day = new Date(since.getTime() + i * DAY + 12 * HOUR).toLocaleDateString('en-CA', { timeZone: TZ });
    return { date: day, gmv: g.get(day) ?? 0, bids: b.get(day) ?? 0, users: u.get(day) ?? 0 };
  });
};

export const getOverview = async (adminId?: string) => {
  const now = new Date();
  const since30 = new Date(now.getTime() - SERIES_DAYS * DAY);
  const [queues, paid30, endingSoon, bidsToday, escrow, series, attention] = await Promise.all([
    getQueueCounts(adminId),
    prisma.order.aggregate({
      where: { events: { some: { kind: 'payment', status: 'paid', createdAt: { gte: since30 } } } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.auction.count({ where: { status: 'active', endTime: { gt: now, lte: new Date(now.getTime() + HOUR) } } }),
    prisma.bid.count({ where: { bidTime: { gte: startOfLagosDay() } } }),
    // In escrow: paid, not refunded, and the seller hasn't been released yet.
    prisma.order.aggregate({
      where: { paymentStatus: 'paid', payoutStatus: { in: ['pending', 'held'] } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    dailySeries(),
    getAttention(5),
  ]);

  return {
    generated_at: now.toISOString(),
    stats: {
      gross_sales_30d: toNumber(paid30._sum.totalAmount),
      paid_orders_30d: paid30._count,
      live_auctions: queues.live_auctions,
      ending_next_hour: endingSoon,
      bids_today: bidsToday,
      held_in_escrow: toNumber(escrow._sum.totalAmount),
      escrow_orders: escrow._count,
      kyb_queue: queues.kyb,
      at_hub: queues.inspection_hub,
    },
    queues,
    series,
    attention,
  };
};

/** The rules the apps run on, read from the same constants the backend uses. */
export const getRules = () => ({
  fees: [
    { key: 'platform_fee', label: 'Platform fee', value: `${config.platformFeePercentage}% of the winning bid`, note: 'Taken from the seller payout' },
    { key: 'delivery_fee', label: 'Delivery fee', value: money(config.deliveryFee), note: 'Added to the buyer total' },
    { key: 'bid_hold', label: 'Bid commitment', value: money(BID_COMMITMENT_AMOUNT), note: 'Held in the wallet for each auction bid on, until it ends' },
    { key: 'min_increment', label: 'Smallest bid step', value: money(config.minBidIncrement), note: 'Bigger steps apply on pricier items' },
  ],
  rules: [
    { key: 'pay_window', label: 'Time to pay after winning', value: `${ORDER_PAYMENT_EXPIRY_HOURS} hours` },
    { key: 'second_chance', label: 'Second-chance offer', value: `${OFFER_WINDOW_HOURS} hours to accept` },
    { key: 'dropoff', label: 'Seller drops it at the hub', value: DROPOFF_RULE, note: 'Computer Village hub, open Monday to Saturday' },
    { key: 'missed_payments', label: 'Missed payments', value: `${MISSED_PAYMENT_LIMIT} in ${MISSED_PAYMENT_LOOKBACK_DAYS} days pauses bidding for ${BIDDING_PAUSE_DAYS} days` },
    { key: 'confirm_window', label: 'Buyer confirms delivery', value: `${CONFIRM_WINDOW_HOURS} hours, then we confirm for them` },
    { key: 'return_window', label: 'Return after a refund decision', value: `${RETURN_WINDOW_DAYS} days` },
    { key: 'auto_extend', label: 'Late bids extend the auction', value: `${config.autoExtendMinutes} minutes` },
    { key: 'auction_length', label: 'Default auction length', value: `${config.defaultAuctionDurationHours} hours` },
  ],
  review_targets: [
    { key: 'kyb', label: 'Seller KYB', value: `${REVIEW_TARGET_HOURS.kyb} hours` },
    { key: 'listing', label: 'Listing review', value: `${REVIEW_TARGET_HOURS.listing} hours` },
    { key: 'hub', label: 'Hub inspection', value: `${REVIEW_TARGET_HOURS.hub} hours after it arrives` },
    { key: 'dispute', label: 'Dispute decision', value: `${REVIEW_TARGET_HOURS.dispute} hours` },
  ],
});

/** Launch readiness, from real settings and data. Never returns a secret, only yes/no. */
export const getLaunchChecklist = async () => {
  const [verifiedSellers, auctions, admins, paidOrders] = await Promise.all([
    prisma.user.count({ where: { role: 'seller', sellerKybStatus: 'approved' } }),
    prisma.auction.count(),
    prisma.user.count({ where: { role: 'admin', isActive: true } }),
    prisma.order.count({ where: { paymentStatus: { in: ['paid', 'refunded'] } } }),
  ]);
  const env = process.env;
  const items = [
    { key: 'paystack_live', label: 'Paystack live keys', done: !!env.PAYSTACK_SECRET_KEY?.startsWith('sk_live_'), hint: 'Payments still use test keys.' },
    { key: 'email', label: 'Email sending', done: !!env.RESEND_API_KEY && !!env.EMAIL_FROM, hint: 'Add the Resend key and sender address.' },
    { key: 'sms', label: 'SMS sender ID', done: !!env.TERMII_API_KEY && !!env.TERMII_SENDER_ID, hint: 'Termii key or sender ID is missing.' },
    { key: 'push', label: 'Push notifications', done: env.PUSH_NOTIFICATIONS_DISABLED !== 'true' && !!env.EXPO_ACCESS_TOKEN, hint: 'Add the Expo access token.' },
    { key: 'team', label: 'Second admin on the team', done: admins >= 2, hint: 'Invite someone so you are not the only admin.' },
    { key: 'seller', label: 'First seller verified', done: verifiedSellers > 0, hint: 'Approve a seller in the KYB queue.' },
    { key: 'auction', label: 'First auction listed', done: auctions > 0, hint: 'No auctions yet.' },
    { key: 'order', label: 'First paid order', done: paidOrders > 0, hint: 'No order has been paid yet.' },
  ];
  return { done: items.filter(i => i.done).length, total: items.length, items };
};

/* ---------- Sign-in page panel (public, before anyone signs in) ---------- */

type PanelItem = { title: string; sub: string; at: number };
export type SignInPanel = {
  ticker: { title: string; sub: string }[];
  escrow: { held: number; bars: number[] };
};

const ago = (d: Date, now = Date.now()) => {
  const m = Math.max(0, Math.round((now - d.getTime()) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

let panelCache: { at: number; data: SignInPanel } | null = null;

/**
 * The brand panel on the admin sign-in page. Anyone can load it, so it only carries what is
 * already public (live bids, seller codes, gadget titles, no staff names or payout amounts),
 * the escrow total, and the shape of the last 7 days of money coming in (relative bar
 * heights, not daily amounts). Cached for a minute.
 */
export const getSignInPanel = async (): Promise<SignInPanel> => {
  if (panelCache && Date.now() - panelCache.at < 60_000) return panelCache.data;
  const since7 = startOfLagosDay(-6);
  const [recentBids, seller, inspected, payout, escrow, days] = await Promise.all([
    prisma.bid.findMany({
      where: { auction: { status: 'active' } },
      orderBy: { bidTime: 'desc' },
      take: 1,
      select: {
        auctionId: true,
        bidTime: true,
        auction: { select: { currentPrice: true, totalBids: true, gadget: { select: { title: true } } } },
      },
    }),
    prisma.user.findFirst({
      where: { sellerKybStatus: 'approved', sellerKybReviewedAt: { not: null } },
      orderBy: { sellerKybReviewedAt: 'desc' },
      select: { id: true, sellerKybReviewedAt: true },
    }),
    // Every order is checked at the hub before it ships or is collected.
    prisma.orderEvent.findFirst({
      where: { kind: 'fulfillment', status: { in: ['shipped', 'delivered'] } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, order: { select: { auction: { select: { gadget: { select: { title: true } } } } } } },
    }),
    prisma.order.findFirst({
      where: { payoutStatus: 'paid', payoutPaidAt: { not: null }, sellerId: { not: null } },
      orderBy: { payoutPaidAt: 'desc' },
      select: { sellerId: true, payoutPaidAt: true },
    }),
    prisma.order.aggregate({
      where: { paymentStatus: 'paid', payoutStatus: { in: ['pending', 'held'] } },
      _sum: { totalAmount: true },
    }),
    prisma.$queryRaw<SeriesRow[]>`
      SELECT to_char((e.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(o.total_amount), 0)::float8 AS value
        FROM order_events e JOIN orders o ON o.id = e.order_id
       WHERE e.kind = 'payment' AND e.status = 'paid' AND e.created_at >= ${since7}
       GROUP BY 1`,
  ]);

  // Always in this order: a new bid, a seller approved, an inspection passed, a payout sent.
  const items: PanelItem[] = [];
  const bid = recentBids.find(b => b.auction);
  if (bid?.auction) {
    const n = bid.auction.totalBids ?? 0;
    items.push({
      title: `New bid on ${bid.auction.gadget?.title ?? 'a gadget'}`,
      sub: `${money(toNumber(bid.auction.currentPrice))} · ${n} bid${n === 1 ? '' : 's'}`,
      at: bid.bidTime?.getTime() ?? 0,
    });
  }
  if (seller?.sellerKybReviewedAt) {
    items.push({ title: `Seller approved · ${sellerCode(seller.id)}`, sub: `KYB checked ${ago(seller.sellerKybReviewedAt)}`, at: seller.sellerKybReviewedAt.getTime() });
  }
  if (inspected) {
    const title = inspected.order?.auction?.gadget?.title;
    items.push({ title: 'Passed inspection', sub: title ? `${title} · at the hub` : `Checked at the hub ${ago(inspected.createdAt)}`, at: inspected.createdAt.getTime() });
  }
  if (payout?.payoutPaidAt && payout.sellerId) {
    items.push({ title: `Payout sent · ${sellerCode(payout.sellerId)}`, sub: `Released ${ago(payout.payoutPaidAt)}`, at: payout.payoutPaidAt.getTime() });
  }

  const byDay = new Map(days.map(r => [r.day, Number(r.value)]));
  const values = Array.from({ length: 7 }, (_, i) =>
    byDay.get(new Date(since7.getTime() + i * DAY + 12 * HOUR).toLocaleDateString('en-CA', { timeZone: TZ })) ?? 0
  );
  const max = Math.max(...values);

  const data: SignInPanel = {
    ticker: items.slice(0, 4).map(({ title, sub }) => ({ title, sub })),
    escrow: {
      held: toNumber(escrow._sum.totalAmount),
      bars: values.map(v => (max > 0 ? Math.round((v / max) * 100) / 100 : 0)),
    },
  };
  panelCache = { at: Date.now(), data };
  return data;
};
