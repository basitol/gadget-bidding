import prisma from '../../config/prisma';
import { query } from '../../config/database';
import logger from '../../utils/logger';
import * as ratingService from './rating.service';
import { sellerCode } from './sellerSummary.service';
import { bidderLabel } from '../../utils/bidderLabel';
import { AUCTION_CARD_INCLUDE, toAuctionCard } from './card';
import { createNotification, alreadyNotified } from '../notification/notification.service';

/**
 * Seller store, as buyers see it. Sellers stay anonymous ("Verified seller CV-1042"): no business
 * name, no contact details. Stats come from real orders, ratings and follows.
 */

/** "Top seller": consistently good and has a track record. */
const TOP_SELLER = { minRating: 4.5, minRatings: 10, minSales: 50 };
const DEFAULT_LOCATION = 'Computer Village, Ikeja';

/** The store's chips. The seller's own Store tab uses this too, so both always agree. */
export const storeBadges = (
  seller: { sellerKybStatus: string; cacNumber: string | null },
  rating: { average: number | null; count: number },
  sales: number
) => {
  const verified = seller.sellerKybStatus === 'approved';
  return {
    verified_business: verified,
    cac_registered: verified && !!seller.cacNumber,
    top_seller:
      (rating.average ?? 0) >= TOP_SELLER.minRating && rating.count >= TOP_SELLER.minRatings && sales >= TOP_SELLER.minSales,
  };
};

const assertSeller = async (sellerId: string) => {
  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      id: true,
      role: true,
      sellerKybStatus: true,
      cacNumber: true,
      createdAt: true,
      isActive: true,
      storeAbout: true,
      storeHours: true,
      storeAway: true,
    },
  });
  if (!seller || seller.isActive === false) throw new Error('Store not found');
  return seller;
};

/* ---------------- Opening hours ---------------- */

const HOURS_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const HOURS_DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
type DayHoursValue = { open: string; close: string } | null;

/** "09:00" → "9:00 am", "18:30" → "6:30 pm" */
const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
};

/** [0,1,2,3,4,5] → "Mon–Sat"; [0,2,4] → "Mon, Wed, Fri"; [0,1,2,4] → "Mon–Wed, Fri". */
const dayRuns = (idx: number[]) => {
  const parts: string[] = [];
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
    parts.push(
      j - i >= 2
        ? `${HOURS_DAY_SHORT[idx[i]]}–${HOURS_DAY_SHORT[idx[j]]}`
        : idx.slice(i, j + 1).map(d => HOURS_DAY_SHORT[d]).join(', ')
    );
    i = j + 1;
  }
  return parts.join(', ');
};

/**
 * "Open Mon–Sat, 9:00 am–6:00 pm". Days with other hours follow after " · "
 * ("Open Mon–Fri, 9:00 am–6:00 pm · Sat, 10:00 am–4:00 pm"). null when no hours are set.
 */
export const hoursLine = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, DayHoursValue>;
  const groups = new Map<string, number[]>();
  HOURS_DAYS.forEach((d, i) => {
    const h = v[d];
    if (!h || typeof h.open !== 'string' || typeof h.close !== 'string') return;
    const key = `${h.open}-${h.close}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  if (!groups.size) return 'Closed all week';
  const parts = [...groups.entries()].map(([key, idx]) => {
    const [open, close] = key.split('-');
    return `${dayRuns(idx)}, ${clock(open)}–${clock(close)}`;
  });
  return `Open ${parts.join(' · ')}`;
};

/* ---------------- Reviews (buyer and seller views share this) ---------------- */

export const REVIEW_INCLUDE = { order: { select: { auction: { select: { gadget: { select: { title: true } } } } } } } as const;

type ReviewRow = {
  id: string;
  score: number;
  comment: string | null;
  raterId: string;
  wellPacked: boolean | null;
  sellerReply: string | null;
  sellerRepliedAt: Date | null;
  createdAt: Date;
  order: { auction: { gadget: { title: string } | null } | null } | null;
};

/** One review. `buyer` is a stand-in ("Buyer •••7"), never a name. */
export const reviewView = (r: ReviewRow) => ({
  id: r.id,
  score: r.score,
  comment: r.comment,
  item: r.order?.auction?.gadget?.title ?? null,
  buyer: bidderLabel(r.raterId).replace('Bidder', 'Buyer'),
  created_at: r.createdAt.toISOString(),
  /** "Was it well packed?" (null: not answered). */
  well_packed: r.wellPacked,
  /** The seller's public reply. */
  reply: r.sellerReply ? { text: r.sellerReply, at: (r.sellerRepliedAt ?? r.createdAt).toISOString() } : null,
});

/** Stars 5 → 1 with how many ratings gave each, over every rating (not just the ones listed). */
export const ratingBreakdown = async (sellerId: string) => {
  const groups = await prisma.rating.groupBy({ by: ['score'], where: { rateeId: sellerId }, _count: { _all: true } });
  return [5, 4, 3, 2, 1].map(score => ({ score, count: groups.find(g => g.score === score)?._count._all ?? 0 }));
};

export const profile = async (sellerId: string, viewerId?: string) => {
  const seller = await assertSeller(sellerId);
  const [rating, sales, followers, following, firstListing, address, live] = await Promise.all([
    ratingService.summaryFor(sellerId),
    // Sales: delivered and not refunded (same as the seller's Store tab).
    prisma.order.count({
      where: { sellerId, fulfillmentStatus: 'delivered', paymentStatus: 'paid', disputes: { none: { outcome: 'refund' } } },
    }),
    prisma.follow.count({ where: { sellerId } }),
    viewerId ? prisma.follow.count({ where: { sellerId, followerId: viewerId } }) : Promise.resolve(0),
    prisma.auction.findFirst({ where: { sellerId }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.userAddress.findFirst({ where: { userId: sellerId }, orderBy: { isDefault: 'desc' }, select: { city: true, state: true } }),
    prisma.auction.count({ where: { sellerId, status: 'active', endTime: { gt: new Date() } } }),
  ]);
  const since = firstListing?.createdAt ?? seller.createdAt ?? new Date();

  return {
    id: sellerId,
    code: sellerCode(sellerId),
    location: address?.city ? `${address.city}${address.state ? `, ${address.state}` : ''}` : DEFAULT_LOCATION,
    selling_since: since.toISOString(),
    badges: storeBadges(seller, rating, sales),
    stats: { sales, rating: rating.average, rating_count: rating.count, followers },
    /** What the seller wrote, and opening hours { mon..sun: { open, close } | null } (null: not set). */
    about: seller.storeAbout ?? null,
    hours: (seller.storeHours as Record<string, { open: string; close: string } | null> | null) ?? null,
    /** "Open Mon–Sat, 9:00 am–6:00 pm" (null: not set). */
    hours_line: hoursLine(seller.storeHours),
    /** The seller is away: new listings are paused; live auctions still run. */
    away: seller.storeAway,
    live_count: live,
    following: following > 0,
    is_me: viewerId === sellerId,
  };
};

export const liveAuctions = async (sellerId: string) => {
  await assertSeller(sellerId);
  const rows = await prisma.auction.findMany({
    where: { sellerId, status: 'active', endTime: { gt: new Date() } },
    include: AUCTION_CARD_INCLUDE,
    orderBy: { endTime: 'asc' },
    take: 50,
  });
  return rows.map(toAuctionCard);
};

export const reviews = async (sellerId: string) => {
  await assertSeller(sellerId);
  const [rows, summary, breakdown] = await Promise.all([
    prisma.rating.findMany({
      where: { rateeId: sellerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: REVIEW_INCLUDE,
    }),
    ratingService.summaryFor(sellerId),
    ratingBreakdown(sellerId),
  ]);
  return {
    average: summary.average,
    count: summary.count,
    breakdown,
    reviews: rows.map(reviewView),
  };
};

export const follow = async (followerId: string, sellerId: string) => {
  if (followerId === sellerId) throw new Error("You can't follow your own store");
  await assertSeller(sellerId);
  await prisma.follow.upsert({
    where: { followerId_sellerId: { followerId, sellerId } },
    create: { followerId, sellerId },
    update: {},
  });
  return { following: true, followers: await prisma.follow.count({ where: { sellerId } }) };
};

export const unfollow = async (followerId: string, sellerId: string) => {
  await prisma.follow.deleteMany({ where: { followerId, sellerId } });
  return { following: false, followers: await prisma.follow.count({ where: { sellerId } }) };
};

/** Auction job: tell followers when a store they follow puts a new auction live (once per auction). */
export const notifyFollowersOfNewListings = async () => {
  const rows = await query(
    `SELECT f.follower_id, a.id AS auction_id, a.seller_id, a.current_price, g.title
     FROM auctions a
     JOIN gadgets g ON g.id = a.gadget_id
     JOIN follows f ON f.seller_id = a.seller_id
     WHERE a.status = 'active'
       AND a.start_time >= NOW() - INTERVAL '15 minutes'
       AND a.end_time > NOW()
     LIMIT 1000`
  );
  for (const r of rows) {
    if (await alreadyNotified(r.follower_id, 'store_new_listing', 'auctionId', r.auction_id)) continue;
    await createNotification(
      r.follower_id,
      'store_new_listing',
      `New from seller ${sellerCode(r.seller_id)}`,
      `${r.title} is live now at ₦${Number(r.current_price).toLocaleString()}.`,
      { auctionId: r.auction_id, sellerId: r.seller_id },
      ['push']
    );
  }
  if (rows.length) logger.info(`Store follower alerts checked: ${rows.length}`);
};
