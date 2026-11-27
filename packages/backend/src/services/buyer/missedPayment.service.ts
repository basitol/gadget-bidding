import prisma from '../../config/prisma';
import {
  BIDDING_PAUSE_DAYS,
  MISSED_PAYMENT_LIMIT,
  MISSED_PAYMENT_LOOKBACK_DAYS,
} from '../order/order.service';

/** Missed payments: what the buyer sees after their time to pay ran out. */

const toNumber = (v: unknown) => (v == null ? 0 : Number(String(v)));

const strikeSummary = async (userId: string) => {
  const since = new Date(Date.now() - MISSED_PAYMENT_LOOKBACK_DAYS * 24 * 3_600_000);
  const [strikes, user] = await Promise.all([
    prisma.missedPayment.count({ where: { userId, createdAt: { gte: since } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { biddingPausedUntil: true } }),
  ]);
  const paused = user?.biddingPausedUntil && user.biddingPausedUntil > new Date() ? user.biddingPausedUntil : null;
  return {
    strikes,
    strike_limit: MISSED_PAYMENT_LIMIT,
    lookback_days: MISSED_PAYMENT_LOOKBACK_DAYS,
    pause_days: BIDDING_PAUSE_DAYS,
    bidding_paused_until: paused?.toISOString() ?? null,
  };
};

const format = (m: any) => ({
  id: m.id,
  order_id: m.orderId,
  order_number: m.orderNumber,
  auction_id: m.auctionId,
  category_id: m.categoryId,
  gadget_title: m.gadgetTitle,
  gadget_image: m.gadgetImage,
  winning_bid: toNumber(m.winningBid),
  forfeited_amount: toNumber(m.forfeitedAmount),
  auction_ended_at: m.auctionEndedAt?.toISOString() ?? null,
  created_at: m.createdAt.toISOString(),
});

export const listMissedPayments = async (userId: string) => {
  const rows = await prisma.missedPayment.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return { items: rows.map(format), ...(await strikeSummary(userId)) };
};

export const getMissedPayment = async (userId: string, id: string) => {
  const row = await prisma.missedPayment.findFirst({ where: { id, userId } });
  if (!row) throw new Error('Not found');
  // Which number miss this was (1st, 2nd, …) within the lookback.
  const since = new Date(row.createdAt.getTime() - MISSED_PAYMENT_LOOKBACK_DAYS * 24 * 3_600_000);
  const nth = await prisma.missedPayment.count({
    where: { userId, createdAt: { gte: since, lte: row.createdAt } },
  });
  const [category, order] = await Promise.all([
    row.categoryId
      ? prisma.gadgetCategory.findUnique({ where: { id: row.categoryId }, select: { slug: true } })
      : null,
    row.orderId
      ? prisma.order.findUnique({ where: { id: row.orderId }, select: { buyerId: true, fulfillmentStatus: true } })
      : null,
  ]);
  // Did it go to the next bidder, or was the sale cancelled (nobody else bid)?
  const outcome = order && order.buyerId === userId && order.fulfillmentStatus === 'cancelled' ? 'cancelled' : 'next_bidder';
  return {
    ...format(row),
    nth,
    outcome,
    category_slug: category?.slug ?? null,
    ...(await strikeSummary(userId)),
  };
};
