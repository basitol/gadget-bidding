import prisma from '../../config/prisma';
import { caseLabel } from '../buyer/case.service';
import { dropoffDueOf, dropoffDueAt } from '../order/order.service';

/**
 * What the seller app's Home, My listings and Orders tabs show. Read-only views over
 * orders, auctions, gadgets and cases; the actions use the existing endpoints.
 */

/** A seller has this long to give their side of a case (from when it opened). */
export const CASE_REPLY_HOURS = 48;
const HOUR = 3_600_000;
const num = (v: unknown) => Number(v ?? 0);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

const firstImage = (images: string[] | null | undefined) => images?.[0] ?? null;

/** "Shop 14, Otigba Tech Plaza · Computer Village" */
const shopLine = (a: { shopNumber: string | null; plaza: string | null; area: string } | null) => {
  if (!a) return null;
  const place = [a.shopNumber, a.plaza].filter(Boolean).join(', ');
  const area = a.area.split(',')[0];
  return [place, area].filter(Boolean).join(' · ') || null;
};

const orderInclude = {
  auction: { select: { id: true, gadget: { select: { title: true, images: true } } } },
  events: { select: { kind: true, status: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } },
  disputes: {
    select: {
      id: true,
      caseNumber: true,
      status: true,
      createdAt: true,
      messages: { where: { authorRole: 'seller' }, select: { createdAt: true }, take: 1 },
    },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
};

type SellerOrder = Awaited<ReturnType<typeof loadSellerOrders>>[number];

const loadSellerOrders = (sellerId: string) =>
  prisma.order.findMany({
    where: { sellerId, paymentStatus: { in: ['paid', 'refunded'] } },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

/** The open case on this order that's waiting for the seller's side, if any. */
const caseNeedingReply = (o: SellerOrder) => {
  const d = o.disputes[0];
  if (!d || !['open', 'investigating'].includes(d.status ?? '')) return null;
  if (d.messages.length) return null;
  const opened = d.createdAt ?? o.createdAt ?? new Date();
  return {
    id: d.id,
    number: caseLabel(d.caseNumber),
    respond_by: new Date(opened.getTime() + CASE_REPLY_HOURS * HOUR).toISOString(),
  };
};

const openCase = (o: SellerOrder) => {
  const d = o.disputes[0];
  return d && ['open', 'investigating'].includes(d.status ?? '') ? { id: d.id, number: caseLabel(d.caseNumber) } : null;
};

const soldPrice = (o: SellerOrder) => num(o.totalAmount) - num(o.deliveryFee);

type Stage = 'todo' | 'progress' | 'done';

/** Where an order sits for the seller, and the line under it. */
const describeOrder = (o: SellerOrder) => {
  const reply = caseNeedingReply(o);
  const due = dropoffDueOf(o);
  const fs = o.fulfillmentStatus ?? 'pending';
  const confirmed = !!o.buyerConfirmedAt;
  const anyCase = openCase(o);

  let stage: Stage;
  let chip: { label: string; tone: 'amber' | 'red' | 'blue' | 'green' | 'neutral' };
  if (reply) {
    stage = 'todo';
    chip = { label: 'Reply to buyer', tone: 'red' };
  } else if (o.paymentStatus === 'paid' && due) {
    stage = 'todo';
    chip = { label: 'Drop at hub', tone: 'amber' };
  } else if (o.paymentStatus === 'refunded' || fs === 'cancelled') {
    stage = 'done';
    chip = { label: o.paymentStatus === 'refunded' ? 'Refunded' : 'Cancelled', tone: 'neutral' };
  } else if (o.payoutStatus === 'paid') {
    stage = 'done';
    chip = { label: 'Paid out', tone: 'green' };
  } else if (anyCase) {
    stage = 'progress';
    chip = { label: 'Case open', tone: 'red' };
  } else if (fs === 'sent_to_backoffice') {
    stage = 'progress';
    chip = { label: 'At hub · being checked', tone: 'blue' };
  } else if (fs === 'received_by_backoffice') {
    stage = 'progress';
    chip = { label: 'Passed hub check', tone: 'green' };
  } else if (fs === 'shipped') {
    stage = 'progress';
    chip = { label: o.deliveryMethod === 'pickup' ? 'Ready for pickup' : 'Out for delivery', tone: 'blue' };
  } else if (fs === 'delivered' && !confirmed) {
    stage = 'progress';
    chip = { label: 'Delivered · waiting for buyer', tone: 'blue' };
  } else if (o.payoutStatus === 'sending' || o.payoutStatus === 'ready' || confirmed) {
    stage = 'done';
    chip = { label: o.payoutStatus === 'sending' ? 'Payout on its way' : 'Ready for payout', tone: 'green' };
  } else {
    stage = 'progress';
    chip = { label: 'In progress', tone: 'blue' };
  }

  return {
    stage,
    view: {
      id: o.id,
      order_number: o.orderNumber,
      title: o.auction?.gadget?.title ?? 'Gadget',
      image: firstImage(o.auction?.gadget?.images),
      sold_for: soldPrice(o),
      payout: num(o.sellerPayout),
      chip,
      dropoff_due_at: iso(due),
      case: reply ?? (anyCase ? { ...anyCase, respond_by: null } : null),
      fulfillment_status: fs,
      payout_status: o.payoutStatus,
      updated_at: iso(o.updatedAt),
    },
  };
};

/* ------------------------------------------------------------------ */
/* Orders tab                                                          */
/* ------------------------------------------------------------------ */

export const getSellerOrders = async (sellerId: string, tab: Stage) => {
  const orders = (await loadSellerOrders(sellerId)).map(describeOrder);
  const counts = { todo: 0, progress: 0, done: 0 };
  for (const o of orders) counts[o.stage]++;
  const toDrop = orders.filter(o => o.view.dropoff_due_at && !o.view.case?.respond_by);
  const earliest = toDrop
    .map(o => o.view.dropoff_due_at!)
    .sort()[0];
  const items = orders
    .filter(o => o.stage === tab)
    .map(o => o.view)
    // To do: the most urgent first.
    .sort((a, b) =>
      tab === 'todo'
        ? (a.case?.respond_by ?? a.dropoff_due_at ?? '').localeCompare(b.case?.respond_by ?? b.dropoff_due_at ?? '')
        : 0
    );
  return {
    counts,
    dropoff: toDrop.length ? { count: toDrop.length, due_at: earliest ?? null } : null,
    items,
  };
};

/** Drop-off codes: what the seller shows at the hub (the order numbers waiting to be dropped off). */
export const getDropoffCodes = async (sellerId: string) => {
  const orders = (await loadSellerOrders(sellerId))
    .map(o => ({ o, due: dropoffDueOf(o) }))
    .filter(x => x.o.paymentStatus === 'paid' && x.due);
  return orders
    .sort((a, b) => a.due!.getTime() - b.due!.getTime())
    .map(({ o, due }) => ({
      order_id: o.id,
      code: o.orderNumber,
      title: o.auction?.gadget?.title ?? 'Gadget',
      image: firstImage(o.auction?.gadget?.images),
      due_at: due!.toISOString(),
    }));
};

/* ------------------------------------------------------------------ */
/* My listings tab                                                     */
/* ------------------------------------------------------------------ */

export type ListingTab = 'live' | 'review' | 'changes' | 'unsold';

export const getSellerListings = async (sellerId: string, tab: ListingTab) => {
  const [liveAuctions, pending, rejected, endedAuctions] = await Promise.all([
    prisma.auction.findMany({
      where: { sellerId, status: { in: ['active', 'scheduled'] } },
      include: {
        gadget: { select: { id: true, title: true, images: true } },
        _count: { select: { watchers: true } },
      },
      orderBy: [{ status: 'asc' }, { endTime: 'asc' }],
    }),
    prisma.gadget.findMany({
      where: { sellerId, status: 'pending' },
      select: { id: true, title: true, images: true, createdAt: true, updatedAt: true, auctionStartingPrice: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.gadget.findMany({
      where: { sellerId, status: 'rejected' },
      select: { id: true, title: true, images: true, rejectionReason: true, updatedAt: true, auctionStartingPrice: true },
      orderBy: { updatedAt: 'desc' },
    }),
    // Didn't sell: the latest auction of each gadget that's back to 'approved' (ended or ended by the seller, no winner).
    prisma.auction.findMany({
      where: {
        sellerId,
        status: { in: ['ended', 'cancelled'] },
        winnerId: null,
        gadget: { status: 'approved' },
      },
      include: { gadget: { select: { id: true, title: true, images: true } } },
      orderBy: { endTime: 'desc' },
    }),
  ]);

  const seen = new Set<string>();
  const unsold = endedAuctions.filter(a => {
    if (!a.gadgetId || seen.has(a.gadgetId)) return false;
    seen.add(a.gadgetId);
    return true;
  });

  const counts = { live: liveAuctions.length, review: pending.length, changes: rejected.length, unsold: unsold.length };

  let items: unknown[] = [];
  if (tab === 'live') {
    items = liveAuctions.map(a => ({
      kind: 'auction',
      id: a.id,
      gadget_id: a.gadgetId,
      title: a.gadget?.title ?? 'Gadget',
      image: firstImage(a.gadget?.images),
      status: a.status,
      bids: a.totalBids ?? 0,
      watching: a._count.watchers,
      price: num(a.currentPrice),
      start_time: a.startTime.toISOString(),
      end_time: a.endTime.toISOString(),
      // No bids yet: the price can change and it can be ended.
      can_edit: (a.totalBids ?? 0) === 0,
      starting_price: num(a.startingPrice),
      buy_now_price: a.buyNowPrice != null ? num(a.buyNowPrice) : null,
    }));
  } else if (tab === 'review') {
    items = pending.map(g => ({
      kind: 'gadget',
      id: g.id,
      title: g.title,
      image: firstImage(g.images),
      price: num(g.auctionStartingPrice),
      sent_at: iso(g.updatedAt ?? g.createdAt),
    }));
  } else if (tab === 'changes') {
    items = rejected.map(g => ({
      kind: 'gadget',
      id: g.id,
      title: g.title,
      image: firstImage(g.images),
      price: num(g.auctionStartingPrice),
      note: g.rejectionReason,
      updated_at: iso(g.updatedAt),
    }));
  } else {
    items = unsold.map(a => ({
      kind: 'auction',
      id: a.id,
      gadget_id: a.gadgetId,
      title: a.gadget?.title ?? 'Gadget',
      image: firstImage(a.gadget?.images),
      price: num(a.startingPrice),
      ended_at: a.endTime.toISOString(),
      ended_by_seller: a.status === 'cancelled',
      bids: a.totalBids ?? 0,
    }));
  }
  return { counts, items };
};

/* ------------------------------------------------------------------ */
/* Home tab                                                            */
/* ------------------------------------------------------------------ */

export const getSellerHome = async (sellerId: string) => {
  const since30 = new Date(Date.now() - 30 * 24 * HOUR);
  const [user, app, unread, orders, rejected, live, sold30, ratings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sellerId },
      select: { businessName: true, fullName: true, sellerKybStatus: true },
    }),
    prisma.sellerApplication.findUnique({
      where: { userId: sellerId },
      select: { businessName: true, shopNumber: true, plaza: true, area: true },
    }),
    prisma.notification.count({ where: { userId: sellerId, isRead: false } }),
    loadSellerOrders(sellerId),
    prisma.gadget.findMany({
      where: { sellerId, status: 'rejected' },
      select: { id: true, title: true, rejectionReason: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    prisma.auction.findMany({
      where: { sellerId, status: 'active' },
      include: { gadget: { select: { title: true, images: true } } },
      orderBy: { endTime: 'asc' },
      take: 3,
    }),
    prisma.order.count({
      where: {
        sellerId,
        paymentStatus: 'paid',
        createdAt: { gte: since30 },
        NOT: { fulfillmentStatus: 'cancelled' },
        disputes: { none: { outcome: 'refund' } },
      },
    }),
    prisma.rating.aggregate({ where: { rateeId: sellerId }, _avg: { score: true }, _count: { _all: true } }),
  ]);

  const todo: Array<Record<string, unknown>> = [];
  for (const o of orders) {
    const reply = caseNeedingReply(o);
    if (reply) {
      todo.push({
        kind: 'case',
        id: reply.id,
        order_id: o.id,
        title: `Reply to case ${reply.number}`,
        item: o.auction?.gadget?.title ?? 'Gadget',
        due_at: reply.respond_by,
      });
      continue;
    }
    const due = o.paymentStatus === 'paid' ? dropoffDueOf(o) : null;
    if (due) {
      todo.push({
        kind: 'dropoff',
        id: o.id,
        order_id: o.id,
        title: `Send ${o.orderNumber} to the hub`,
        item: o.auction?.gadget?.title ?? 'Gadget',
        due_at: due.toISOString(),
      });
    }
  }
  for (const g of rejected) {
    todo.push({
      kind: 'changes',
      id: g.id,
      title: 'Changes requested',
      item: g.title,
      note: g.rejectionReason,
      due_at: null,
    });
  }
  todo.sort((a, b) => String(a.due_at ?? '9').localeCompare(String(b.due_at ?? '9')));

  // On time: reached the hub by the drop-off deadline (last 90 days of drop-offs).
  const since90 = Date.now() - 90 * 24 * HOUR;
  let dropped = 0;
  let onTime = 0;
  for (const o of orders) {
    const paid = [...o.events].reverse().find(e => e.kind === 'payment' && e.status === 'paid');
    const atHub = o.events.find(
      e => e.kind === 'fulfillment' && (e.status === 'sent_to_backoffice' || e.status === 'received_by_backoffice')
    );
    if (!paid || !atHub || atHub.createdAt.getTime() < since90) continue;
    dropped++;
    if (atHub.createdAt.getTime() <= dropoffDueAt(paid.createdAt).getTime()) onTime++;
  }

  return {
    business_name: app?.businessName ?? user?.businessName ?? user?.fullName ?? null,
    verified: user?.sellerKybStatus === 'approved',
    shop_line: shopLine(app),
    unread_notifications: unread,
    todo: todo.slice(0, 6),
    todo_count: todo.length,
    live: live.map(a => ({
      id: a.id,
      title: a.gadget?.title ?? 'Gadget',
      image: firstImage(a.gadget?.images),
      bids: a.totalBids ?? 0,
      price: num(a.currentPrice),
      end_time: a.endTime.toISOString(),
    })),
    stats: {
      sold_30d: sold30,
      rating: ratings._count._all ? Math.round((ratings._avg.score ?? 0) * 10) / 10 : null,
      on_time_dropoff: dropped ? Math.round((onTime / dropped) * 100) : null,
    },
  };
};
