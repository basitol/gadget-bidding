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

const assertSeller = async (sellerId: string) => {
  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { id: true, role: true, sellerKybStatus: true, cacNumber: true, createdAt: true, isActive: true },
  });
  if (!seller || seller.isActive === false) throw new Error('Store not found');
  return seller;
};

export const profile = async (sellerId: string, viewerId?: string) => {
  const seller = await assertSeller(sellerId);
  const [rating, sales, followers, following, firstListing, address, live] = await Promise.all([
    ratingService.summaryFor(sellerId),
    prisma.order.count({ where: { sellerId, fulfillmentStatus: 'delivered' } }),
    prisma.follow.count({ where: { sellerId } }),
    viewerId ? prisma.follow.count({ where: { sellerId, followerId: viewerId } }) : Promise.resolve(0),
    prisma.auction.findFirst({ where: { sellerId }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.userAddress.findFirst({ where: { userId: sellerId }, orderBy: { isDefault: 'desc' }, select: { city: true, state: true } }),
    prisma.auction.count({ where: { sellerId, status: 'active', endTime: { gt: new Date() } } }),
  ]);
  const verified = seller.sellerKybStatus === 'approved';
  const since = firstListing?.createdAt ?? seller.createdAt ?? new Date();

  return {
    id: sellerId,
    code: sellerCode(sellerId),
    location: address?.city ? `${address.city}${address.state ? `, ${address.state}` : ''}` : DEFAULT_LOCATION,
    selling_since: since.toISOString(),
    badges: {
      verified_business: verified,
      cac_registered: verified && !!seller.cacNumber,
      top_seller:
        (rating.average ?? 0) >= TOP_SELLER.minRating &&
        rating.count >= TOP_SELLER.minRatings &&
        sales >= TOP_SELLER.minSales,
    },
    stats: { sales, rating: rating.average, rating_count: rating.count, followers },
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
  const rows = await prisma.rating.findMany({
    where: { rateeId: sellerId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { order: { select: { auction: { select: { gadget: { select: { title: true } } } } } } },
  });
  const summary = await ratingService.summaryFor(sellerId);
  const breakdown = [5, 4, 3, 2, 1].map(score => ({ score, count: rows.filter(r => r.score === score).length }));
  return {
    average: summary.average,
    count: summary.count,
    breakdown,
    reviews: rows.map(r => ({
      id: r.id,
      score: r.score,
      comment: r.comment,
      item: r.order?.auction?.gadget?.title ?? null,
      buyer: bidderLabel(r.raterId).replace('Bidder', 'Buyer'),
      created_at: r.createdAt.toISOString(),
    })),
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
