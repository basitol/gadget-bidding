import prisma from '../../config/prisma';
import { query } from '../../config/database';
import logger from '../../utils/logger';
import { alreadyNotified, createNotification } from '../notification/notification.service';
import { dropoffDueAt, dropoffDueOf } from '../order/order.service';
import { caseLabel } from '../buyer/case.service';
import { CASE_REPLY_HOURS } from './sellerTabs.service';

/**
 * The seller app's alerts (design › Seller › Notifications) and its notifications feed.
 * Every alert carries data.kind so the app can file it under Sales, Listings or Money and
 * show the right button while it still applies.
 */

const HOUR = 3_600_000;
const LAGOS_OFFSET_MS = HOUR; // Lagos is UTC+1 all year
const num = (v: unknown) => Number(v ?? 0);
const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/** "6:00 pm today" / "6:00 pm tomorrow" / "6:00 pm Mon", in Lagos time. */
const lagosWhen = (d: Date, now = new Date()) => {
  const l = new Date(d.getTime() + LAGOS_OFFSET_MS);
  const n = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const h = l.getUTCHours();
  const time = `${h % 12 || 12}:${String(l.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  const dayOf = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const diff = Math.round((dayOf(l) - dayOf(n)) / (24 * HOUR));
  if (diff === 0) return `${time} today`;
  if (diff === 1) return `${time} tomorrow`;
  return `${time} ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][l.getUTCDay()]}`;
};

/** "1h 27m" / "14m" / "2d 3h" */
const duration = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};

const safe = (what: string, fn: () => Promise<unknown>) =>
  fn().catch(err => logger.error(`Seller alert (${what}) failed:`, err));

/* ------------------------------------------------------------------ */
/* Alerts                                                              */
/* ------------------------------------------------------------------ */

/** "Sold! iPhone 15 Pro went for ₦865,000" — once per order, when the buyer has paid. */
export const notifySellerSold = (orderId: string) =>
  safe('sold', async () => {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        sellerId: true,
        paymentStatus: true,
        totalAmount: true,
        deliveryFee: true,
        auction: { select: { gadget: { select: { title: true } } } },
      },
    });
    if (!o?.sellerId || o.paymentStatus !== 'paid') return;
    if (await alreadyNotified(o.sellerId, 'payment_received', 'orderId', o.id, 'sold')) return;
    const title = o.auction?.gadget?.title ?? 'Your item';
    const due = dropoffDueAt(new Date());
    await createNotification(
      o.sellerId,
      'payment_received',
      `Sold! ${title} went for ${naira(num(o.totalAmount) - num(o.deliveryFee))}`,
      `The buyer has paid. Drop it at the Computer Village hub by ${lagosWhen(due)}.`,
      { kind: 'sold', reminder: 'sold', orderId: o.id, orderNumber: o.orderNumber, dropoff_due_at: due.toISOString() },
      ['push']
    );
  });

/** Bids for one listing go to the seller as one alert, kept up to date (a phone buzz at most every 30 minutes). */
const BID_PUSH_EVERY_MS = 30 * 60_000;

export const notifySellerNewBid = (auctionId: string) =>
  safe('new bid', async () => {
    const a = await prisma.auction.findUnique({
      where: { id: auctionId },
      select: {
        id: true,
        sellerId: true,
        status: true,
        currentPrice: true,
        totalBids: true,
        endTime: true,
        gadget: { select: { title: true } },
      },
    });
    if (!a?.sellerId || a.status !== 'active') return;
    const bids = a.totalBids ?? 0;
    const title = `New bid on ${a.gadget?.title ?? 'your listing'}`;
    const message = `Now ${naira(num(a.currentPrice))} · ${bids} bid${bids === 1 ? '' : 's'} · ends in ${duration(
      a.endTime.getTime() - Date.now()
    )}.`;

    const [existing] = await query(
      `SELECT id, is_read, data FROM notifications
       WHERE user_id = $1 AND notification_type = 'listing_bid' AND data->>'auctionId' = $2
       ORDER BY created_at DESC LIMIT 1`,
      [a.sellerId, a.id]
    );
    const pushedAt = existing ? Number(existing.data?.pushed_at ?? 0) : 0;
    if (existing && !existing.is_read && Date.now() - pushedAt < BID_PUSH_EVERY_MS) {
      // Still unread and buzzed recently: just refresh it in the list.
      await query(
        `UPDATE notifications SET title = $2, message = $3, data = data || $4::jsonb, created_at = NOW(), sent_at = NOW()
         WHERE id = $1`,
        [existing.id, title, message, JSON.stringify({ price: num(a.currentPrice), bids })]
      );
      return;
    }
    if (existing && !existing.is_read) await query('DELETE FROM notifications WHERE id = $1', [existing.id]);
    await createNotification(
      a.sellerId,
      'listing_bid',
      title,
      message,
      { kind: 'new_bid', auctionId: a.id, price: num(a.currentPrice), bids, pushed_at: Date.now() },
      ['push']
    );
  });

/** Our team asked for changes before a listing can go live. */
export const notifySellerChangesRequested = (gadgetId: string, reason: string) =>
  safe('changes requested', async () => {
    const g = await prisma.gadget.findUnique({ where: { id: gadgetId }, select: { id: true, sellerId: true, title: true } });
    if (!g?.sellerId) return;
    const why = reason.trim().replace(/\s+/g, ' ');
    await createNotification(
      g.sellerId,
      'system',
      'Changes requested on your listing',
      `${g.title} — ${why.charAt(0).toLowerCase() + why.slice(1)}${/[.!?]$/.test(why) ? '' : '.'} Fix it to go live.`,
      { kind: 'changes', gadgetId: g.id },
      ['push']
    );
  });

/** The listing passed our review and its auction is live (or scheduled). */
export const notifySellerListingApproved = (gadgetId: string) =>
  safe('listing approved', async () => {
    const g = await prisma.gadget.findUnique({
      where: { id: gadgetId },
      select: {
        id: true,
        sellerId: true,
        title: true,
        auctions: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, startTime: true } },
      },
    });
    if (!g?.sellerId) return;
    const a = g.auctions[0];
    const later = a?.status === 'scheduled';
    await createNotification(
      g.sellerId,
      'auction_created',
      'Listing approved',
      later ? `${g.title} goes live at ${lagosWhen(a!.startTime)}.` : `${g.title} is now live.`,
      { kind: 'approved', gadgetId: g.id, auctionId: a?.id },
      ['push']
    );
  });

/** Bidding ended: with a winner (waiting for payment) or without a sale. */
export const notifySellerAuctionEnded = (auctionId: string, sold: boolean) =>
  safe('auction ended', async () => {
    const a = await prisma.auction.findUnique({
      where: { id: auctionId },
      select: { id: true, sellerId: true, currentPrice: true, totalBids: true, gadget: { select: { title: true } } },
    });
    if (!a?.sellerId) return;
    const title = a.gadget?.title ?? 'Your listing';
    await (sold
      ? createNotification(
          a.sellerId,
          'auction_won',
          `Bidding ended on ${title}`,
          `Winning bid ${naira(num(a.currentPrice))}. We'll tell you as soon as the buyer pays.`,
          { kind: 'bidding_ended', auctionId: a.id },
          ['push']
        )
      : createNotification(
          a.sellerId,
          'auction_lost',
          'Ended without a sale',
          `${title} got ${a.totalBids ? 'no winning bid' : 'no bids'}. You can relist it from My listings.`,
          { kind: 'unsold', auctionId: a.id },
          ['push']
        ));
  });

/** A buyer reported a problem with one of the seller's orders. */
export const notifySellerCaseOpened = (disputeId: string) =>
  safe('case opened', async () => {
    const d = await prisma.dispute.findUnique({
      where: { id: disputeId },
      select: {
        id: true,
        caseNumber: true,
        createdAt: true,
        order: { select: { id: true, sellerId: true, auction: { select: { gadget: { select: { title: true } } } } } },
      },
    });
    const sellerId = d?.order?.sellerId;
    if (!d || !sellerId) return;
    const respondBy = new Date((d.createdAt ?? new Date()).getTime() + CASE_REPLY_HOURS * HOUR);
    await createNotification(
      sellerId,
      'dispute_opened',
      'A buyer reported a problem',
      `${d.order?.auction?.gadget?.title ?? 'Your item'} · case ${caseLabel(d.caseNumber)}. Reply within ${CASE_REPLY_HOURS} hours.`,
      { kind: 'case', disputeId: d.id, orderId: d.order?.id, respond_by: respondBy.toISOString() },
      ['push', 'email']
    );
  });

/** The item passed all hub checks. */
export const notifySellerHubPassed = (orderId: string) =>
  safe('hub passed', async () => {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, sellerId: true, deliveryMethod: true, auction: { select: { gadget: { select: { title: true } } } } },
    });
    if (!o?.sellerId) return;
    if (await alreadyNotified(o.sellerId, 'fulfillment_updated', 'orderId', o.id, 'hub_passed')) return;
    const title = o.auction?.gadget?.title ?? 'Your item';
    await createNotification(
      o.sellerId,
      'fulfillment_updated',
      'Passed hub inspection',
      o.deliveryMethod === 'pickup'
        ? `${title} matched your listing and is ready for the buyer to collect.`
        : `${title} matched your listing and is on its way to the buyer.`,
      { kind: 'hub_passed', reminder: 'hub_passed', orderId: o.id },
      ['push']
    );
  });

/* ------------------------------------------------------------------ */
/* The feed                                                            */
/* ------------------------------------------------------------------ */

export type FeedFilter = 'all' | 'sales' | 'listings' | 'money';
type Category = 'sales' | 'listings' | 'money' | 'other';

/** What an alert is about. New alerts carry data.kind; older ones are read from their type. */
const kindOf = (type: string, data: Record<string, any>): string => {
  if (data.kind) return String(data.kind);
  switch (type) {
    case 'payment_received':
      return 'sold';
    case 'listing_bid':
      return 'new_bid';
    case 'auction_won':
      return 'bidding_ended';
    case 'auction_lost':
    case 'auction_no_sale':
      return 'unsold';
    case 'auction_created':
      return 'approved';
    case 'dispute_opened':
    case 'dispute_updated':
      return data.disputeId ? 'case' : 'other';
    case 'order_delivered':
    case 'order_shipped':
    case 'fulfillment_updated':
      return 'order';
    case 'support_message':
      return 'support';
    case 'seller_application':
      return 'application';
    default:
      return 'other';
  }
};

const CATEGORY: Record<string, Category> = {
  sold: 'sales',
  bidding_ended: 'sales',
  case: 'sales',
  hub_passed: 'sales',
  order: 'sales',
  new_bid: 'listings',
  changes: 'listings',
  approved: 'listings',
  unsold: 'listings',
  payout: 'money',
  payout_account: 'money',
};

type Row = {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  data: Record<string, any> | string | null;
  is_read: boolean;
  created_at: Date;
};

export const listSellerNotifications = async (sellerId: string, filter: FeedFilter) => {
  const rows: Row[] = await query(
    `SELECT id, notification_type, title, message, data, is_read, created_at
     FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [sellerId]
  );
  const parsed = rows.map(r => {
    const data = (typeof r.data === 'string' ? JSON.parse(r.data || '{}') : r.data ?? {}) as Record<string, any>;
    const kind = kindOf(r.notification_type, data);
    return { r, data, kind, category: CATEGORY[kind] ?? ('other' as Category) };
  });
  const unread = parsed.filter(p => !p.r.is_read).length;
  const shown = parsed.filter(p => filter === 'all' || p.category === filter);

  // What's true now, so buttons only show while they still apply.
  const ids = (k: string, key: string) => [...new Set(shown.filter(p => p.kind === k && p.data[key]).map(p => String(p.data[key])))];
  const [soldOrders, bidAuctions, changedGadgets, cases, unsoldAuctions] = await Promise.all([
    prisma.order.findMany({
      where: { id: { in: ids('sold', 'orderId') }, sellerId },
      select: {
        id: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        events: { select: { kind: true, status: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      },
    }),
    prisma.auction.findMany({
      where: { id: { in: ids('new_bid', 'auctionId') }, sellerId },
      select: { id: true, status: true, currentPrice: true, totalBids: true, endTime: true },
    }),
    prisma.gadget.findMany({ where: { id: { in: ids('changes', 'gadgetId') }, sellerId }, select: { id: true, status: true } }),
    prisma.dispute.findMany({
      where: { id: { in: ids('case', 'disputeId') }, order: { sellerId } },
      select: {
        id: true,
        status: true,
        createdAt: true,
        messages: { where: { authorRole: 'seller' }, select: { id: true }, take: 1 },
      },
    }),
    prisma.auction.findMany({
      where: { id: { in: ids('unsold', 'auctionId') }, sellerId },
      select: { id: true, gadget: { select: { status: true } } },
    }),
  ]);
  const byId = <T extends { id: string }>(list: T[]) => new Map(list.map(x => [x.id, x]));
  const orders = byId(soldOrders);
  const auctions = byId(bidAuctions);
  const gadgets = byId(changedGadgets);
  const disputes = byId(cases);
  const unsold = byId(unsoldAuctions);

  const items = shown.map(({ r, data, kind, category }) => {
    let message = r.message;
    let action: { type: string; label: string; primary: boolean } | null = null;
    const live: Record<string, unknown> = {};

    if (kind === 'sold') {
      const o = orders.get(String(data.orderId));
      const due = o ? dropoffDueOf(o) : null;
      if (due) {
        live.dropoff_due_at = due.toISOString();
        action = { type: 'send_to_hub', label: 'Send to hub', primary: true };
      } else if (o && o.paymentStatus === 'paid' && o.fulfillmentStatus !== 'cancelled') {
        message = "The buyer has paid. It's with our hub now.";
      }
    } else if (kind === 'new_bid') {
      const a = auctions.get(String(data.auctionId));
      if (a) {
        const bids = a.totalBids ?? 0;
        live.price = num(a.currentPrice);
        live.bids = bids;
        if (a.status === 'active') live.end_time = a.endTime.toISOString();
        else message = `Ended at ${naira(num(a.currentPrice))} · ${bids} bid${bids === 1 ? '' : 's'}.`;
      }
    } else if (kind === 'changes') {
      if (gadgets.get(String(data.gadgetId))?.status === 'rejected') {
        action = { type: 'fix_listing', label: 'Fix listing', primary: true };
      }
    } else if (kind === 'case') {
      const d = disputes.get(String(data.disputeId));
      const open = d && ['open', 'investigating'].includes(d.status ?? '');
      if (open && !d!.messages.length) {
        live.respond_by = new Date((d!.createdAt ?? r.created_at).getTime() + CASE_REPLY_HOURS * HOUR).toISOString();
      } else if (open) {
        message = message.replace(/Reply within .*$/, 'Our team is reviewing it.');
      } else if (d) {
        message = message.replace(/Reply within .*$/, 'Our team has decided.');
      }
      action = { type: 'view_case', label: 'View case', primary: !!live.respond_by };
    } else if (kind === 'payout') {
      action = { type: 'see_payouts', label: 'See payouts', primary: false };
    } else if (kind === 'unsold') {
      if (unsold.get(String(data.auctionId))?.gadget?.status === 'approved') {
        action = { type: 'relist', label: 'Relist', primary: false };
      }
    } else if (kind === 'support') {
      action = { type: 'open_chat', label: 'Reply', primary: false };
    }

    return {
      id: r.id,
      kind,
      category,
      title: r.title,
      message,
      is_read: !!r.is_read,
      created_at: new Date(r.created_at).toISOString(),
      order_id: data.orderId ?? data.order_id ?? null,
      auction_id: data.auctionId ?? data.auction_id ?? null,
      gadget_id: data.gadgetId ?? null,
      dispute_id: data.disputeId ?? null,
      live,
      action,
    };
  });

  return { unread, items };
};
