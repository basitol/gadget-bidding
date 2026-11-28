import prisma from '../../config/prisma';
import logger from '../../utils/logger';
import {
  CONDITION_GRADES,
  platformFeeFor,
  platformFeeLabel,
  photoSlotsFor,
  profileByKey,
  type DeviceProfile,
} from '@gadget-bidding/shared';
import * as notificationService from '../notification/notification.service';
import { releaseHold } from '../wallet/wallet.service';
import { ORDER_PAYMENT_EXPIRY_HOURS } from '../order/order.service';
import { LISTING_DURATIONS_HOURS, MAX_LISTING_PHOTOS, MIN_START_PRICE } from '../gadget/listing.service';
import { relistAuction } from '../auction/auction.service';

/**
 * Managing a listing after it went live (the seller app's Manage listing, Edit listing, End listing,
 * End early and Relist screens), mounted at /api/v1/seller/manage.
 *
 * No bids yet: the seller can change the starting price, how long it runs and their note, or end it.
 * Once someone bids, the price, grade and details are locked (fair for bidders): they can only add a
 * note for bidders or a photo (both checked by our team first), or end early: sell now to the
 * highest bidder (the normal auction-end path, so the winner gets the usual time to pay) or cancel
 * it because something is wrong with the item (every bid hold is released and bidders are told).
 */

const HOUR = 3_600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PRICE = 100_000_000;
const NOTE_MAX = 1000;
const BIDDER_NOTE_MAX = 500;

export class ManageError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string
  ) {
    super(message);
  }
}

const num = (v: unknown) => (v == null ? 0 : Number(v.toString()));
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const round1k = (n: number) => Math.round(n / 1000) * 1000;
const round5k = (n: number) => Math.max(5000, Math.round(n / 5000) * 5000);

export const END_REASONS = ['sold_elsewhere', 'change_price', 'found_fault', 'other'] as const;
export type EndReason = (typeof END_REASONS)[number];

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

const loadOwned = async (sellerId: string, auctionId: string) => {
  if (!UUID.test(auctionId)) throw new ManageError('We couldn’t find that listing.', 404);
  const auction = await prisma.auction.findFirst({
    where: { id: auctionId, sellerId },
    include: { gadget: true, _count: { select: { watchers: true } } },
  });
  if (!auction || !auction.gadget) throw new ManageError('We couldn’t find that listing.', 404);
  return auction as typeof auction & { gadget: NonNullable<typeof auction.gadget> };
};

type Owned = Awaited<ReturnType<typeof loadOwned>>;

const specsOf = (g: Owned['gadget']) =>
  g.specifications && typeof g.specifications === 'object' && !Array.isArray(g.specifications)
    ? (g.specifications as Record<string, any>)
    : {};

/** Approved photos with the slot they were taken for ("Front", "Back"…), in the listing's order. */
const photosOf = (g: Owned['gadget']) => {
  const specs = specsOf(g);
  const profile = profileByKey(typeof specs.profile === 'string' ? specs.profile : null) as DeviceProfile | null;
  const bySlot = (specs.photos ?? {}) as Record<string, string>;
  const labelFor = new Map<string, string>();
  if (profile) {
    for (const slot of photoSlotsFor(profile, true)) {
      const url = bySlot[slot.key];
      if (url) labelFor.set(url, slot.label);
    }
  }
  return (g.images ?? []).map((url, i) => ({ url, label: labelFor.get(url) ?? (i === 0 ? 'Main' : 'Added') }));
};

/** The seller's own words: their note on listing-flow listings, the whole description on older ones. */
const editableText = (g: Owned['gadget']): { text: string; mode: 'note' | 'description' } => {
  const specs = specsOf(g);
  if (typeof specs.profile === 'string')
    return { text: typeof specs.note === 'string' ? specs.note : '', mode: 'note' };
  return { text: g.description ?? '', mode: 'description' };
};

/** Paid sales of the same model (and storage) in the last 30 days, other than this one. */
const similarSold = async (g: Owned['gadget']) => {
  const model = (g.model ?? '').trim();
  if (model.length < 2) return null;
  const specs = specsOf(g);
  const storage = typeof specs.storage === 'string' && specs.storage.trim() ? specs.storage.trim() : null;
  const rows = await prisma.$queryRaw<{ price: unknown }[]>`
    SELECT (o.total_amount - COALESCE(o.delivery_fee, 0)) AS price
    FROM orders o
    JOIN auctions a ON a.id = o.auction_id
    JOIN gadgets g ON g.id = a.gadget_id
    WHERE o.payment_status = 'paid'
      AND o.fulfillment_status IS DISTINCT FROM 'cancelled'
      AND o.created_at >= NOW() - INTERVAL '30 days'
      AND lower(trim(g.model)) = lower(${model})
      AND (${storage}::text IS NULL OR lower(g.specifications->>'storage') = lower(${storage}::text))
      AND g.id <> ${g.id}::uuid`;
  const prices = rows.map(r => num(r.price)).filter(p => Number.isFinite(p) && p > 0);
  if (prices.length < 2) return null;
  return { model, low: round1k(Math.min(...prices)), high: round1k(Math.max(...prices)), count: prices.length };
};

/**
 * "Listings with 6+ photos got 2.1× more bids": only from our own auctions that ended in the last
 * 180 days, only with at least 20 in each group and a clear difference. Otherwise nothing.
 */
const PHOTO_TIP_AT = 6;
const photoTip = async (photoCount: number) => {
  if (photoCount >= PHOTO_TIP_AT) return null;
  const rows = await prisma.$queryRaw<{ many: boolean; n: number; avg_bids: number }[]>`
    SELECT (cardinality(g.images) >= ${PHOTO_TIP_AT}) AS many, count(*)::int AS n, avg(COALESCE(a.total_bids, 0))::float AS avg_bids
    FROM auctions a
    JOIN gadgets g ON g.id = a.gadget_id
    WHERE a.status = 'ended' AND a.end_time >= NOW() - INTERVAL '180 days'
    GROUP BY 1`;
  const many = rows.find(r => r.many);
  const few = rows.find(r => !r.many);
  if (!many || !few || many.n < 20 || few.n < 20 || few.avg_bids <= 0) return null;
  const ratio = Math.round((many.avg_bids / few.avg_bids) * 10) / 10;
  return ratio >= 1.5 ? { threshold: PHOTO_TIP_AT, ratio, sample: many.n + few.n } : null;
};

const winningBid = (auctionId: string) =>
  prisma.bid.findFirst({
    where: { auctionId, isWinning: true, status: { in: ['active', 'outbid'] } },
    orderBy: { amount: 'desc' },
    select: { id: true, amount: true },
  });

const money = (sale: number) => {
  const fee = platformFeeFor(sale);
  return { sale, fee, fee_label: platformFeeLabel(sale), you_receive: Math.max(0, sale - fee) };
};

/* ------------------------------------------------------------------ */
/* Manage view (GET /seller/manage/:auctionId)                         */
/* ------------------------------------------------------------------ */

export const getManageView = async (sellerId: string, auctionId: string) => {
  const a = await loadOwned(sellerId, auctionId);
  const g = a.gadget;
  const specs = specsOf(g);
  const bids = await prisma.bid.count({ where: { auctionId: a.id, status: { in: ['active', 'outbid', 'won'] } } });
  const open = a.status === 'active' || a.status === 'scheduled';
  const top = bids ? await winningBid(a.id) : null;
  const reserve = a.reservePrice != null ? num(a.reservePrice) : null;
  const photos = photosOf(g);
  const [similar, tip] = await Promise.all([similarSold(g), open && bids === 0 ? photoTip(photos.length) : null]);
  const runHours = Math.round((a.endTime.getTime() - a.startTime.getTime()) / HOUR);
  const grade = CONDITION_GRADES.find(c => c.key === g.condition);

  return {
    auction_id: a.id,
    gadget_id: g.id,
    status: a.status,
    /** Ended with a winner (the sale is in Orders). */
    sold: !!a.winnerId,
    title: g.title,
    model: g.model,
    image: g.images?.[0] ?? null,
    photos,
    pending_photos: g.pendingImages ?? [],
    max_photos: MAX_LISTING_PHOTOS,
    grade: grade?.label ?? null,
    battery: typeof specs.battery_health === 'number' ? specs.battery_health : null,
    identifier_masked: typeof specs.identifier_masked === 'string' ? specs.identifier_masked : null,
    listed_at: iso(a.startTime),
    start_time: iso(a.startTime),
    end_time: iso(a.endTime),
    run_hours: runHours,
    durations_hours: [...LISTING_DURATIONS_HOURS],
    starting_price: num(a.startingPrice),
    current_price: num(a.currentPrice),
    buy_now_price: a.buyNowPrice != null ? num(a.buyNowPrice) : null,
    reserve_price: reserve,
    min_start_price: MIN_START_PRICE,
    bids,
    watching: a._count.watchers,
    /** No bids yet and still running: price, length and note can change, and it can be ended for free. */
    can_edit: open && bids === 0,
    /** Bids in: only a note, a photo or ending early. */
    locked: open && bids > 0,
    note: editableText(g),
    bidder_note: g.bidderNote ?? null,
    bidder_note_pending: g.bidderNotePending ?? null,
    highest_bid: top ? { amount: num(top.amount), reserve_met: reserve == null || num(top.amount) >= reserve } : null,
    /** Sell now: what the seller gets from the highest bid. */
    if_sold_now: top ? money(num(top.amount)) : null,
    /** No bids: what they'd get at the starting price. */
    at_start: money(num(a.startingPrice)),
    /** The winner's time to pay once it ends. */
    payment_hours: ORDER_PAYMENT_EXPIRY_HOURS,
    similar_sold: similar,
    photo_tip: tip,
    end_reason: a.endReason,
  };
};

/* ------------------------------------------------------------------ */
/* Edit while there are no bids (PATCH /seller/manage/:auctionId)       */
/* ------------------------------------------------------------------ */

export type EditBody = { starting_price?: unknown; duration_hours?: unknown; note?: unknown };

const wholeNaira = (raw: unknown): number | null => {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[,\s₦]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : NaN;
};

/** Swap the "Seller’s note:" line in a listing-flow description (or add it, or take it out). */
const withNote = (description: string, note: string) => {
  const lines = description.split('\n').filter(l => !/^Seller[’']s note:/.test(l));
  if (note) lines.push(`Seller’s note: ${note}`);
  return lines.join('\n').slice(0, 5000);
};

export const editListing = async (sellerId: string, auctionId: string, body: EditBody) => {
  const start = wholeNaira(body.starting_price);
  if (start !== null && (Number.isNaN(start) || start < MIN_START_PRICE)) {
    throw new ManageError(`The starting price has to be at least ₦${MIN_START_PRICE.toLocaleString('en-NG')}.`);
  }
  if (start !== null && start > MAX_PRICE)
    throw new ManageError('That starting price is too high. Check it and try again.');
  const hours = body.duration_hours == null ? null : Number(body.duration_hours);
  if (hours !== null && !(LISTING_DURATIONS_HOURS as readonly number[]).includes(hours)) {
    throw new ManageError('Pick how long it runs: 1, 3, 5 or 7 days.');
  }
  if (body.note != null && typeof body.note !== 'string') throw new ManageError('Write the description as text.');
  const note = typeof body.note === 'string' ? body.note.replace(/[ \t]+\n/g, '\n').trim() : null;
  if (note !== null && note.length > NOTE_MAX) throw new ManageError('Keep the description under 1,000 characters.');
  if (start === null && hours === null && note === null) throw new ManageError('Nothing to change.');

  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM auctions WHERE id = ${auctionId}::uuid FOR UPDATE`;
    const a = await tx.auction.findFirst({ where: { id: auctionId, sellerId }, include: { gadget: true } });
    if (!a || !a.gadget) throw new ManageError('We couldn’t find that listing.', 404);
    if (a.status !== 'active' && a.status !== 'scheduled')
      throw new ManageError('This listing isn’t running, so it can’t change.');
    if ((a.totalBids ?? 0) > 0 || (await tx.bid.count({ where: { auctionId } })) > 0) {
      throw new ManageError('Someone has bid, so the price and details are locked now.', 409);
    }

    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (start !== null) {
      const buyNow = a.buyNowPrice != null ? num(a.buyNowPrice) : null;
      if (buyNow != null && buyNow <= start) {
        throw new ManageError(`Your buy-now price is ₦${buyNow.toLocaleString('en-NG')}, so start below that.`);
      }
      data.startingPrice = start;
      data.currentPrice = start;
      // A hidden lowest price under the new start no longer does anything (and the database refuses it).
      if (a.reservePrice != null && num(a.reservePrice) < start) data.reservePrice = null;
    }
    if (hours !== null) {
      const end = new Date(a.startTime.getTime() + hours * HOUR);
      if (a.status === 'active' && end.getTime() < Date.now() + HOUR) {
        throw new ManageError('That would end it within the hour. Pick a longer run.');
      }
      data.endTime = end;
    }
    await tx.auction.update({ where: { id: auctionId }, data });

    const gadgetData: Record<string, unknown> = { updatedAt: new Date() };
    if (start !== null) gadgetData.auctionStartingPrice = start;
    if (hours !== null) gadgetData.auctionDurationHours = hours;
    if (note !== null) {
      const specs = specsOf(a.gadget as Owned['gadget']);
      if (typeof specs.profile === 'string') {
        const next = { ...specs };
        if (note) next.note = note;
        else delete next.note;
        gadgetData.specifications = next;
        gadgetData.description = withNote(a.gadget.description ?? '', note);
      } else {
        if (note.length < 10) throw new ManageError('Add a little more to the description (at least 10 characters).');
        gadgetData.description = note;
      }
    }
    await tx.gadget.update({ where: { id: a.gadget.id }, data: gadgetData });
  });
  logger.info(`Seller ${sellerId} edited live listing ${auctionId}`);
  return getManageView(sellerId, auctionId);
};

/** Ending now: end_time has to stay after start_time (a database rule), so a run that hasn't started ends a second after. */
const endNow = (startTime: Date) => {
  const now = new Date();
  return now > startTime ? now : new Date(startTime.getTime() + 1000);
};

/* ------------------------------------------------------------------ */
/* End with no bids (POST /seller/manage/:auctionId/end)               */
/* ------------------------------------------------------------------ */

export const endListing = async (sellerId: string, auctionId: string, reason: unknown) => {
  if (!END_REASONS.includes(reason as EndReason)) throw new ManageError('Pick why you’re ending it.');
  const ended = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM auctions WHERE id = ${auctionId}::uuid FOR UPDATE`;
    const a = await tx.auction.findFirst({
      where: { id: auctionId, sellerId },
      include: { gadget: { select: { id: true, title: true } } },
    });
    if (!a) throw new ManageError('We couldn’t find that listing.', 404);
    if (a.status !== 'active' && a.status !== 'scheduled')
      throw new ManageError('This listing has already ended.', 409);
    if ((await tx.bid.count({ where: { auctionId } })) > 0) {
      throw new ManageError('Someone has bid, so use End early instead.', 409, 'HAS_BIDS');
    }
    await tx.auction.update({
      where: { id: auctionId },
      data: { status: 'cancelled', endReason: reason as string, endTime: endNow(a.startTime), updatedAt: new Date() },
    });
    if (a.gadgetId)
      await tx.gadget.update({ where: { id: a.gadgetId }, data: { status: 'approved', updatedAt: new Date() } });
    await tx.autoBid.updateMany({
      where: { auctionId, isActive: true },
      data: { isActive: false, updatedAt: new Date() },
    });
    return { title: a.gadget?.title ?? 'This item', wasLive: a.status === 'active' };
  });

  // Watchers: it came down without a sale. Nobody bid, so nobody was charged.
  if (ended.wasLive) {
    const watchers = await prisma.watch.findMany({ where: { auctionId }, select: { userId: true } });
    for (const w of watchers) {
      if (w.userId === sellerId) continue;
      notificationService
        .notifyAuctionNoSale(w.userId, auctionId, ended.title, 'no_bids')
        .catch(err => logger.error('Ended-listing alert failed:', err));
    }
  }
  logger.info(`Seller ${sellerId} ended listing ${auctionId} (${reason})`);
  return { auction_id: auctionId, status: 'cancelled', end_reason: reason };
};

/* ------------------------------------------------------------------ */
/* End early with bids (POST /seller/manage/:auctionId/end-early)       */
/* ------------------------------------------------------------------ */

/** Sell now to the highest bidder: the auction ends now through the normal end path (order, time to pay, alerts). */
const sellNow = async (sellerId: string, auctionId: string) => {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM auctions WHERE id = ${auctionId}::uuid FOR UPDATE`;
    const a = await tx.auction.findFirst({ where: { id: auctionId, sellerId } });
    if (!a) throw new ManageError('We couldn’t find that listing.', 404);
    if (a.status !== 'active') throw new ManageError('This auction isn’t running, so it can’t end early.', 409);
    const top = await tx.bid.findFirst({
      where: { auctionId, isWinning: true, status: { in: ['active', 'outbid'] } },
      orderBy: { amount: 'desc' },
    });
    if (!top)
      throw new ManageError(
        'Nobody has bid yet, so there’s nobody to sell to. You can end it instead.',
        409,
        'NO_BIDS'
      );
    if (a.reservePrice != null && num(top.amount) < num(a.reservePrice)) {
      throw new ManageError(
        `The highest bid is under your lowest price of ₦${num(a.reservePrice).toLocaleString('en-NG')}, so it can’t sell now.`,
        409,
        'RESERVE_NOT_MET'
      );
    }
    await tx.auction.update({
      where: { id: auctionId },
      data: { endTime: endNow(a.startTime), endReason: 'sold_early', updatedAt: new Date() },
    });
  });

  // The same job that ends every auction: winner, order, payment window, everyone's alerts.
  const { triggerAuctionProcessing } = await import('../../jobs/auction.job');
  await triggerAuctionProcessing();

  const order = await prisma.order.findUnique({
    where: { auctionId },
    select: { id: true, orderNumber: true, paymentDueAt: true, createdAt: true, totalAmount: true },
  });
  if (!order) {
    // Maintenance (nothing ends until it's over) or the job is mid-run: it ends on the next pass.
    return { auction_id: auctionId, action: 'sell', ending: true, order: null };
  }
  const due =
    order.paymentDueAt ??
    (order.createdAt ? new Date(order.createdAt.getTime() + ORDER_PAYMENT_EXPIRY_HOURS * HOUR) : null);
  logger.info(`Seller ${sellerId} sold ${auctionId} early as ${order.orderNumber}`);
  return {
    auction_id: auctionId,
    action: 'sell',
    ending: false,
    order: { id: order.id, order_number: order.orderNumber, payment_due_at: iso(due) },
  };
};

/** Cancel because something is wrong with the item: nobody wins, every bid hold goes back, bidders are told. */
const cancelForProblem = async (sellerId: string, auctionId: string, detail: string | null) => {
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM auctions WHERE id = ${auctionId}::uuid FOR UPDATE`;
    const a = await tx.auction.findFirst({
      where: { id: auctionId, sellerId },
      include: { gadget: { select: { title: true } } },
    });
    if (!a) throw new ManageError('We couldn’t find that listing.', 404);
    if (a.status !== 'active' && a.status !== 'scheduled') throw new ManageError('This auction isn’t running.', 409);
    await tx.auction.update({
      where: { id: auctionId },
      data: { status: 'cancelled', endReason: 'problem', endTime: endNow(a.startTime), updatedAt: new Date() },
    });
    if (a.gadgetId)
      await tx.gadget.update({ where: { id: a.gadgetId }, data: { status: 'approved', updatedAt: new Date() } });
    await tx.autoBid.updateMany({
      where: { auctionId, isActive: true },
      data: { isActive: false, updatedAt: new Date() },
    });
    const held = await tx.bidHold.findMany({ where: { status: 'held', bid: { auctionId } }, select: { bidId: true } });
    const bidders = await tx.bid.findMany({
      where: { auctionId, bidderId: { not: null } },
      select: { bidderId: true },
      distinct: ['bidderId'],
    });
    return {
      title: a.gadget?.title ?? 'This item',
      held: held.map(h => h.bidId).filter((id): id is string => !!id),
      bidders: bidders.map(b => b.bidderId!).filter(id => id !== sellerId),
      bids: a.totalBids ?? 0,
    };
  });

  for (const bidId of result.held) await releaseHold(bidId).catch(err => logger.error('Release hold failed:', err));

  const watchers = await prisma.watch.findMany({ where: { auctionId }, select: { userId: true } });
  const told = new Set<string>();
  for (const userId of result.bidders) {
    told.add(userId);
    notificationService
      .createNotification(
        userId,
        'auction_no_sale',
        'Auction cancelled',
        `The seller cancelled ${result.title} because something is wrong with the item. Nobody won, nothing was charged and your bid hold is back in your wallet.`,
        { auctionId },
        ['push']
      )
      .catch(err => logger.error('Cancel alert failed:', err));
  }
  for (const w of watchers) {
    if (told.has(w.userId) || w.userId === sellerId) continue;
    notificationService
      .createNotification(
        w.userId,
        'auction_no_sale',
        'Auction cancelled',
        `The seller cancelled ${result.title}. We'll tell you if it's listed again.`,
        { auctionId },
        ['push']
      )
      .catch(err => logger.error('Cancel alert failed:', err));
  }
  // Our team looks at every cancellation with bids.
  notificationService
    .notifyAdmins(
      'system',
      'A seller cancelled an auction with bids',
      `${result.title}: ${result.bids} bid${result.bids === 1 ? '' : 's'} cancelled for a problem with the item.${detail ? ` They said: “${detail}”` : ''}`,
      { auctionId, route: '/auctions' }
    )
    .catch(() => {});
  logger.info(`Seller ${sellerId} cancelled ${auctionId} with bids (problem with the item)`);
  return { auction_id: auctionId, action: 'cancel', released_holds: result.held.length };
};

export const endEarly = async (sellerId: string, auctionId: string, body: { action?: unknown; detail?: unknown }) => {
  if (!UUID.test(auctionId)) throw new ManageError('We couldn’t find that listing.', 404);
  const detail = typeof body.detail === 'string' && body.detail.trim() ? body.detail.trim().slice(0, 300) : null;
  if (body.action === 'sell') return sellNow(sellerId, auctionId);
  if (body.action === 'cancel') return cancelForProblem(sellerId, auctionId, detail);
  throw new ManageError('Pick how you want to end it.');
};

/* ------------------------------------------------------------------ */
/* Additions our team checks first: a note for bidders, more photos     */
/* ------------------------------------------------------------------ */

const assertRunning = (a: Owned) => {
  if (a.status !== 'active' && a.status !== 'scheduled') throw new ManageError('This listing isn’t running.', 409);
};

export const addBidderNote = async (sellerId: string, auctionId: string, raw: unknown) => {
  if (typeof raw !== 'string' || !raw.trim()) throw new ManageError('Write the note first.');
  const note = raw.replace(/\s+\n/g, '\n').trim();
  if (note.length < 5) throw new ManageError('Add a little more to the note.');
  if (note.length > BIDDER_NOTE_MAX) throw new ManageError(`Keep the note under ${BIDDER_NOTE_MAX} characters.`);
  const a = await loadOwned(sellerId, auctionId);
  assertRunning(a);
  await prisma.gadget.update({ where: { id: a.gadget.id }, data: { bidderNotePending: note, updatedAt: new Date() } });
  notificationService
    .notifyAdmins(
      'gadget_submitted',
      'A note for bidders to check',
      `${a.gadget.title}: the seller added a note for bidders.`,
      {
        gadgetId: a.gadget.id,
        auctionId,
        route: '/gadgets',
      }
    )
    .catch(() => {});
  return getManageView(sellerId, auctionId);
};

const isMediaUrl = (u: unknown): u is string =>
  typeof u === 'string' && u.length <= 2048 && (/^https?:\/\//i.test(u) || u.startsWith('/uploads/'));

export const addPhotos = async (sellerId: string, auctionId: string, raw: unknown) => {
  const urls = (Array.isArray(raw) ? raw : [raw]).filter(isMediaUrl).map(u => u.trim());
  if (!urls.length) throw new ManageError('That photo didn’t upload properly. Add it again.');
  const a = await loadOwned(sellerId, auctionId);
  assertRunning(a);
  const pending = Array.from(new Set([...(a.gadget.pendingImages ?? []), ...urls])).filter(
    u => !(a.gadget.images ?? []).includes(u)
  );
  if ((a.gadget.images?.length ?? 0) + pending.length > MAX_LISTING_PHOTOS) {
    throw new ManageError(`A listing can have up to ${MAX_LISTING_PHOTOS} photos.`);
  }
  await prisma.gadget.update({ where: { id: a.gadget.id }, data: { pendingImages: pending, updatedAt: new Date() } });
  notificationService
    .notifyAdmins(
      'gadget_submitted',
      'New photos to check',
      `${a.gadget.title}: the seller added ${urls.length === 1 ? 'a photo' : `${urls.length} photos`}.`,
      {
        gadgetId: a.gadget.id,
        auctionId,
        route: '/gadgets',
      }
    )
    .catch(() => {});
  return getManageView(sellerId, auctionId);
};

/** Take back a photo that our team hasn't checked yet. */
export const removePendingPhoto = async (sellerId: string, auctionId: string, url: unknown) => {
  if (typeof url !== 'string') throw new ManageError('Pick the photo to remove.');
  const a = await loadOwned(sellerId, auctionId);
  const pending = (a.gadget.pendingImages ?? []).filter(u => u !== url);
  if (pending.length === (a.gadget.pendingImages ?? []).length)
    throw new ManageError('That photo isn’t waiting to be checked.', 404);
  await prisma.gadget.update({ where: { id: a.gadget.id }, data: { pendingImages: pending, updatedAt: new Date() } });
  return getManageView(sellerId, auctionId);
};

/* ------------------------------------------------------------------ */
/* Relist (GET + POST /seller/manage/:auctionId/relist)                 */
/* ------------------------------------------------------------------ */

const unsoldOrThrow = async (sellerId: string, auctionId: string) => {
  const a = await loadOwned(sellerId, auctionId);
  if (a.status !== 'ended' && a.status !== 'cancelled') throw new ManageError('This auction hasn’t ended yet.', 409);
  if (a.winnerId) throw new ManageError('This sold, so it can’t be relisted.', 409);
  return a;
};

export const getRelistView = async (sellerId: string, auctionId: string) => {
  const a = await unsoldOrThrow(sellerId, auctionId);
  const g = a.gadget;
  const lastStart = num(a.startingPrice);
  const similar = await similarSold(g);
  // Our tip only comes from real sales: a quarter of the way into what similar items sold for, when
  // that's under the last start.
  const tip = similar ? round5k(similar.low + (similar.high - similar.low) / 4) : null;
  const lastHours = Math.round((a.endTime.getTime() - a.startTime.getTime()) / HOUR);
  return {
    auction_id: a.id,
    gadget_id: g.id,
    title: g.title,
    image: g.images?.[0] ?? null,
    ended_at: iso(a.endTime),
    ended_by_seller: a.status === 'cancelled',
    end_reason: a.endReason,
    bids: a.totalBids ?? 0,
    watched: a._count.watchers,
    last_starting_price: lastStart,
    reserve_price: a.reservePrice != null ? num(a.reservePrice) : null,
    buy_now_price: a.buyNowPrice != null ? num(a.buyNowPrice) : null,
    similar_sold: similar,
    tip_price: tip != null && tip < lastStart && tip >= MIN_START_PRICE ? tip : null,
    last_run_hours: (LISTING_DURATIONS_HOURS as readonly number[]).includes(lastHours) ? lastHours : null,
    durations_hours: [...LISTING_DURATIONS_HOURS],
    min_start_price: MIN_START_PRICE,
    /** The gadget can go up again (not already back up, not stopped by our team). */
    can_relist: g.status === 'approved',
  };
};

export const relist = async (
  sellerId: string,
  auctionId: string,
  body: { starting_price?: unknown; duration_hours?: unknown }
) => {
  const a = await unsoldOrThrow(sellerId, auctionId);
  const start = wholeNaira(body.starting_price);
  if (start === null || Number.isNaN(start)) throw new ManageError('Pick a starting price.');
  if (start < MIN_START_PRICE)
    throw new ManageError(`The starting price has to be at least ₦${MIN_START_PRICE.toLocaleString('en-NG')}.`);
  if (start > MAX_PRICE) throw new ManageError('That starting price is too high. Check it and try again.');
  const hours = Number(body.duration_hours);
  if (!(LISTING_DURATIONS_HOURS as readonly number[]).includes(hours))
    throw new ManageError('Pick how long it runs: 1, 3, 5 or 7 days.');
  const buyNow = a.buyNowPrice != null ? num(a.buyNowPrice) : null;
  if (buyNow != null && buyNow <= start) {
    throw new ManageError(`Your buy-now price is ₦${buyNow.toLocaleString('en-NG')}, so start below that.`);
  }
  // A hidden lowest price under the new start does nothing any more.
  const reserve = a.reservePrice != null && num(a.reservePrice) <= start ? null : undefined;
  try {
    const next = await relistAuction(sellerId, auctionId, {
      starting_price: start,
      reserve_price: reserve,
      duration_hours: hours,
    });
    return { auction_id: next.id, end_time: next.end_time, starting_price: next.starting_price };
  } catch (e: any) {
    throw new ManageError(e?.message || 'We couldn’t relist it. Try again.', 409);
  }
};

/* ------------------------------------------------------------------ */
/* Our team: photos and notes added to live listings                    */
/* ------------------------------------------------------------------ */

export const listPendingAdditions = async () => {
  const gadgets = await prisma.gadget.findMany({
    where: { OR: [{ pendingImages: { isEmpty: false } }, { bidderNotePending: { not: null } }] },
    select: {
      id: true,
      title: true,
      images: true,
      pendingImages: true,
      bidderNote: true,
      bidderNotePending: true,
      updatedAt: true,
      seller: { select: { id: true, businessName: true, fullName: true, email: true } },
      auctions: {
        where: { status: { in: ['active', 'scheduled', 'paused'] } },
        select: { id: true, status: true, endTime: true, totalBids: true },
        take: 1,
      },
    },
    orderBy: { updatedAt: 'asc' },
    take: 50,
  });
  return gadgets.map(g => ({
    gadget_id: g.id,
    title: g.title,
    image: g.images?.[0] ?? null,
    photos: g.images ?? [],
    pending_photos: g.pendingImages ?? [],
    bidder_note: g.bidderNote,
    bidder_note_pending: g.bidderNotePending,
    updated_at: iso(g.updatedAt),
    seller: g.seller
      ? { id: g.seller.id, name: g.seller.businessName || g.seller.fullName, email: g.seller.email }
      : null,
    auction: g.auctions[0]
      ? {
          id: g.auctions[0].id,
          status: g.auctions[0].status,
          end_time: iso(g.auctions[0].endTime),
          bids: g.auctions[0].totalBids ?? 0,
        }
      : null,
  }));
};

/**
 * Approve or turn down what a seller added. Approved photos join the listing's photos; an approved
 * note shows to bidders. The seller is told either way.
 */
export const decideAdditions = async (
  gadgetId: string,
  body: { approve_photos?: unknown; reject_photos?: unknown; note?: unknown; reason?: unknown }
) => {
  if (!UUID.test(gadgetId)) throw new ManageError('That listing isn’t right.', 404);
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string') : []);
  const approve = list(body.approve_photos);
  const reject = list(body.reject_photos);
  const note = body.note === 'approve' || body.note === 'reject' ? body.note : null;
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 300) : null;
  if (!approve.length && !reject.length && !note) throw new ManageError('Pick what to approve or turn down.');
  if ((reject.length || note === 'reject') && !reason)
    throw new ManageError('Say why, so the seller knows what to fix.');

  const out = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM gadgets WHERE id = ${gadgetId}::uuid FOR UPDATE`;
    const g = await tx.gadget.findUnique({
      where: { id: gadgetId },
      select: { id: true, title: true, sellerId: true, images: true, pendingImages: true, bidderNotePending: true },
    });
    if (!g) throw new ManageError('We couldn’t find that listing.', 404);
    const pending = g.pendingImages ?? [];
    for (const u of [...approve, ...reject])
      if (!pending.includes(u)) throw new ManageError('One of those photos was already decided. Refresh.', 409);
    if (note && !g.bidderNotePending) throw new ManageError('That note was already decided. Refresh.', 409);
    const images = [...(g.images ?? []), ...approve].slice(0, MAX_LISTING_PHOTOS);
    await tx.gadget.update({
      where: { id: gadgetId },
      data: {
        images,
        pendingImages: pending.filter(u => !approve.includes(u) && !reject.includes(u)),
        ...(note === 'approve' ? { bidderNote: g.bidderNotePending, bidderNotePending: null } : {}),
        ...(note === 'reject' ? { bidderNotePending: null } : {}),
        updatedAt: new Date(),
      },
    });
    return g;
  });

  if (out.sellerId) {
    const parts: string[] = [];
    if (approve.length)
      parts.push(
        `${approve.length === 1 ? 'Your new photo is' : `${approve.length} new photos are`} on the listing now.`
      );
    if (note === 'approve') parts.push('Bidders can see your note now.');
    if (reject.length)
      parts.push(`We didn’t add ${reject.length === 1 ? 'a photo' : `${reject.length} photos`}: ${reason}`);
    if (note === 'reject') parts.push(`We didn’t add your note: ${reason}`);
    notificationService
      .createNotification(out.sellerId, 'system', out.title, parts.join(' '), { gadgetId }, ['push'])
      .catch(err => logger.error('Additions decision alert failed:', err));
  }
  return { gadget_id: gadgetId, approved_photos: approve.length, rejected_photos: reject.length, note };
};
