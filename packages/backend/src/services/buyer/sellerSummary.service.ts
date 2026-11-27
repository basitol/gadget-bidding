import crypto from 'crypto';
import prisma from '../../config/prisma';
import * as ratingService from './rating.service';

/** Public seller code shown to buyers instead of a business name, e.g. "CV-1042". Stable per seller. */
export const sellerCode = (sellerId: string) => {
  const n = parseInt(crypto.createHash('sha256').update(`seller:${sellerId}`).digest('hex').slice(0, 8), 16);
  return `CV-${1000 + (n % 9000)}`;
};

/** "Verified seller CV-1042 · Verified business · 4.8 rating · 212 sales" on the auction page. */
export const forAuction = async (auctionId: string) => {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { sellerId: true, gadget: { select: { sellerId: true } } },
  });
  const sellerId = auction?.sellerId || auction?.gadget?.sellerId;
  if (!sellerId) throw new Error('Auction not found');

  const [seller, rating, sales] = await Promise.all([
    prisma.user.findUnique({ where: { id: sellerId }, select: { sellerKybStatus: true, isVerified: true } }),
    ratingService.summaryFor(sellerId),
    prisma.order.count({ where: { sellerId, fulfillmentStatus: 'delivered' } }),
  ]);

  return {
    id: sellerId,
    code: sellerCode(sellerId),
    verified_business: seller?.sellerKybStatus === 'approved',
    rating: rating.average,
    rating_count: rating.count,
    sales,
  };
};
