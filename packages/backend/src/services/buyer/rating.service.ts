import prisma from '../../config/prisma';

/** Buyer and seller rate each other once per delivered order. */
export const rateOrder = async (
  raterId: string,
  orderId: string,
  score: number,
  comment?: string
) => {
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('Pick 1 to 5 stars');
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { buyerId: true, sellerId: true, fulfillmentStatus: true },
  });
  if (!order || (order.buyerId !== raterId && order.sellerId !== raterId)) {
    throw new Error('Order not found');
  }
  if (order.fulfillmentStatus !== 'delivered') {
    throw new Error('You can rate once the order has been delivered');
  }
  const rateeId = raterId === order.buyerId ? order.sellerId : order.buyerId;
  if (!rateeId) throw new Error('This order has no one to rate');

  const existing = await prisma.rating.findUnique({
    where: { orderId_raterId: { orderId, raterId } },
  });
  if (existing) throw new Error("You've already rated this order");

  const rating = await prisma.rating.create({
    data: { orderId, raterId, rateeId, score, comment: comment?.trim().slice(0, 500) || null },
  });
  return { id: rating.id, score: rating.score, comment: rating.comment };
};

export const getMyRatingForOrder = async (raterId: string, orderId: string) => {
  const r = await prisma.rating.findUnique({ where: { orderId_raterId: { orderId, raterId } } });
  return r ? { score: r.score, comment: r.comment } : null;
};

/** Average and count of ratings a user has received. */
export const summaryFor = async (userId: string) => {
  const agg = await prisma.rating.aggregate({
    where: { rateeId: userId },
    _avg: { score: true },
    _count: { _all: true },
  });
  return {
    average: agg._avg.score != null ? Math.round(agg._avg.score * 10) / 10 : null,
    count: agg._count._all,
  };
};
