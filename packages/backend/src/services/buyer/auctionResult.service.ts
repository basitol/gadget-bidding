import prisma from '../../config/prisma';

/**
 * "Auction ended" for one buyer: how it ended for them, the numbers behind it, and similar
 * auctions ending soon. Outcomes:
 *  - won       → the app sends them to pay (order_id)
 *  - lost      → they bid, someone else won
 *  - sold      → watched but didn't bid, someone else won
 *  - no_sale   → ended with no winner: bids under the reserve, or no bids at all
 *  - cancelled → stopped early by the team
 *  - live      → not over yet
 */
const toNumber = (v: unknown) => (v == null ? 0 : Number(String(v)));

/** Short name used for "Alert me when another is listed" (matched against listing titles). */
const alertQuery = (g: { model?: string | null; title: string }) =>
  (g.model?.trim() || g.title.split('·').map(s => s.trim()).find(s => s.length > 3) || g.title).slice(0, 60);

export const getAuctionResult = async (userId: string, auctionId: string) => {
  const a = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { gadget: { include: { category: true } } },
  });
  if (!a || !a.gadget) throw new Error('We couldn’t find that auction');

  const [bidCount, bidders, top, mine, watched, autoBid, order, staffCancel] = await Promise.all([
    prisma.bid.count({ where: { auctionId } }),
    prisma.bid.groupBy({ by: ['bidderId'], where: { auctionId }, _max: { amount: true } }),
    prisma.bid.aggregate({ where: { auctionId }, _max: { amount: true } }),
    prisma.bid.aggregate({ where: { auctionId, bidderId: userId }, _max: { amount: true } }),
    prisma.watch.findUnique({ where: { userId_auctionId: { userId, auctionId } }, select: { id: true } }),
    prisma.autoBid.findFirst({ where: { userId, auctionId }, select: { id: true } }),
    a.winnerId === userId
      ? prisma.order.findFirst({ where: { auctionId, buyerId: userId }, select: { id: true }, orderBy: { createdAt: 'desc' } })
      : Promise.resolve(null),
    prisma.auditLog.findFirst({ where: { action: 'auction_cancel', resourceId: auctionId }, select: { id: true } }),
  ]);

  const myTop = mine._max.amount == null ? null : toNumber(mine._max.amount);
  const highest = top._max.amount == null ? null : toNumber(top._max.amount);
  const reserve = a.reservePrice == null ? null : toNumber(a.reservePrice);
  const over = a.status === 'ended' || a.status === 'cancelled';
  // Ran its full time and was closed by the end job, not stopped early by the seller or staff.
  const ranFull = a.endTime.getTime() <= Date.now() && !staffCancel;

  let outcome: 'won' | 'lost' | 'sold' | 'no_sale' | 'cancelled' | 'live';
  let reason: 'reserve' | 'no_bids' | null = null;
  if (!over) outcome = 'live';
  else if (a.winnerId && a.winnerId === userId) outcome = 'won';
  else if (a.winnerId) outcome = myTop != null ? 'lost' : 'sold';
  else if (bidCount === 0 && ranFull) {
    outcome = 'no_sale';
    reason = 'no_bids';
  } else if (reserve != null && highest != null && highest < reserve && ranFull) {
    outcome = 'no_sale';
    reason = 'reserve';
  } else outcome = 'cancelled';

  // Next in line: the second-highest bidder may be offered it if the winner doesn't pay.
  const ranked = bidders
    .filter(b => b.bidderId)
    .sort((x, y) => toNumber(y._max.amount) - toNumber(x._max.amount))
    .map(b => b.bidderId)
    .filter(id => id !== a.winnerId);
  const nextInLine = outcome === 'lost' && ranked[0] === userId;

  // Similar auctions ending soon: same category first, then anything live.
  const now = new Date();
  const live = { status: 'active', endTime: { gt: now }, id: { not: auctionId } } as const;
  const pick = { id: true, currentPrice: true, endTime: true, gadget: { select: { title: true, images: true } } } as const;
  const same = a.gadget.categoryId
    ? await prisma.auction.findMany({
        where: { ...live, gadget: { categoryId: a.gadget.categoryId } },
        select: pick,
        orderBy: { endTime: 'asc' },
        take: 4,
      })
    : [];
  const more =
    same.length < 4
      ? await prisma.auction.findMany({
          where: { ...live, id: { notIn: [auctionId, ...same.map(s => s.id)] } },
          select: pick,
          orderBy: { endTime: 'asc' },
          take: 4 - same.length,
        })
      : [];

  // Back up for auction? (The seller relisted this gadget after a run that didn't sell.)
  const relisted =
    outcome === 'no_sale' || outcome === 'cancelled'
      ? await prisma.auction.findFirst({
          where: { gadgetId: a.gadgetId, id: { not: a.id }, status: { in: ['scheduled', 'active'] } },
          select: { id: true },
        })
      : null;

  return {
    auction_id: a.id,
    relisted_auction_id: relisted?.id ?? null,
    outcome,
    reason,
    title: a.gadget.title,
    image: a.gadget.images?.[0] ?? null,
    sold_for: a.winnerId ? toNumber(a.currentPrice) : null,
    highest_bid: highest,
    my_top_bid: myTop,
    bid_count: bidCount,
    bidder_count: bidders.filter(b => b.bidderId).length,
    ended_at: (over ? a.endTime : null)?.toISOString() ?? null,
    next_in_line: nextInLine,
    watched: !!watched,
    had_auto_bid: !!autoBid,
    order_id: order?.id ?? null,
    alert: { query: alertQuery(a.gadget), category_slug: a.gadget.category?.slug ?? null },
    similar: [...same, ...more].map(s => ({
      id: s.id,
      title: s.gadget?.title ?? 'Gadget',
      image: s.gadget?.images?.[0] ?? null,
      current_price: toNumber(s.currentPrice),
      end_time: s.endTime.toISOString(),
    })),
  };
};
