import prisma from '../../config/prisma';
import { AUCTION_CARD_INCLUDE, toAuctionCard } from './card';
import * as ratingService from './rating.service';
import { USERNAME_PATTERN } from '../auth/auth.service';

export type BidTab = 'bidding' | 'won' | 'lost';

/** Everything the Profile screen shows, in one call. */
export const summary = async (userId: string) => {
  const [user, wonCount, biddingRows, rating, watchCount, toPay, toConfirm, addresses, card, searches] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, twoFactorEnabled: true, email: true, fullName: true },
      }),
      prisma.auction.count({ where: { winnerId: userId, status: 'ended' } }),
      prisma.bid.findMany({
        where: { bidderId: userId, auction: { status: 'active' } },
        distinct: ['auctionId'],
        select: { auctionId: true },
      }),
      ratingService.summaryFor(userId),
      prisma.watch.count({ where: { userId, auction: { status: { in: ['active', 'scheduled'] } } } }),
      prisma.order.count({ where: { buyerId: userId, paymentStatus: 'pending', fulfillmentStatus: 'pending' } }),
      prisma.order.count({ where: { buyerId: userId, paymentStatus: 'paid', fulfillmentStatus: 'shipped' } }),
      prisma.userAddress.findMany({
        where: { userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: { label: true, city: true, isDefault: true },
      }),
      prisma.savedCard.findFirst({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }),
      prisma.savedSearch.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);

  return {
    username: user?.username ?? null,
    location: addresses[0]?.city ?? null,
    stats: { won: wonCount, bidding: biddingRows.length, rating: rating.average, rating_count: rating.count },
    watchlist_count: watchCount,
    orders: { to_pay: toPay, to_confirm: toConfirm },
    addresses: addresses.map(a => a.label || a.city).filter(Boolean),
    default_card: card ? `${card.brand.charAt(0).toUpperCase()}${card.brand.slice(1)} ending ${card.last4}` : null,
    saved_searches: searches.map(s => s.query || s.categorySlug).filter(Boolean),
    two_factor_enabled: user?.twoFactorEnabled ?? false,
  };
};

/** My bids, one row per auction, for the Bidding / Won / Lost tabs. */
export const myBids = async (userId: string, tab: BidTab) => {
  const mine = await prisma.bid.groupBy({
    by: ['auctionId'],
    where: { bidderId: userId },
    _max: { amount: true },
  });
  const ids = mine.map(m => m.auctionId).filter((x): x is string => !!x);
  if (!ids.length) return { rows: [], counts: { bidding: 0, won: 0, lost: 0 } };

  const [auctions, leaders, autos, orders] = await Promise.all([
    prisma.auction.findMany({ where: { id: { in: ids } }, include: AUCTION_CARD_INCLUDE }),
    prisma.bid.findMany({ where: { auctionId: { in: ids }, isWinning: true }, select: { auctionId: true, bidderId: true } }),
    prisma.autoBid.findMany({ where: { userId, auctionId: { in: ids }, isActive: true } }),
    prisma.order.findMany({
      where: { buyerId: userId, auctionId: { in: ids } },
      select: { id: true, auctionId: true, paymentStatus: true, fulfillmentStatus: true, orderNumber: true },
    }),
  ]);
  const myMax = new Map(mine.map(m => [m.auctionId, Number(m._max.amount)]));
  const leaderOf = new Map(leaders.map(l => [l.auctionId, l.bidderId]));
  const autoOf = new Map(autos.map(a => [a.auctionId, Number(a.maxAmount)]));
  const orderOf = new Map(orders.map(o => [o.auctionId, o]));

  const rows = auctions.map(a => {
    const card = toAuctionCard(a);
    const ended = a.status === 'ended' || a.status === 'cancelled';
    const won = a.status === 'ended' && a.winnerId === userId;
    const order = orderOf.get(a.id);
    return {
      ...card,
      my_bid: myMax.get(a.id) ?? 0,
      auto_bid_max: autoOf.get(a.id) ?? null,
      is_leading: !ended && leaderOf.get(a.id) === userId,
      result: ended ? (won ? 'won' : 'lost') : 'bidding',
      order: order
        ? {
            id: order.id,
            order_number: order.orderNumber,
            payment_status: order.paymentStatus,
            fulfillment_status: order.fulfillmentStatus,
          }
        : null,
    };
  });

  const counts = {
    bidding: rows.filter(r => r.result === 'bidding').length,
    won: rows.filter(r => r.result === 'won').length,
    lost: rows.filter(r => r.result === 'lost').length,
  };
  const picked = rows
    .filter(r => r.result === tab)
    .sort((x, y) =>
      tab === 'bidding'
        ? new Date(x.end_time).getTime() - new Date(y.end_time).getTime()
        : new Date(y.end_time).getTime() - new Date(x.end_time).getTime()
    );
  return { rows: picked, counts };
};

/** Personal details. Email changes go through verification, so they're not editable here. */
export const updateProfile = async (
  userId: string,
  input: { full_name?: string; username?: string; avatar_url?: string; phone_number?: string }
) => {
  const data: Record<string, unknown> = {};
  if (input.full_name !== undefined) {
    const name = input.full_name.trim();
    if (name.length < 2 || name.length > 255) throw new Error('Enter your full name');
    data.fullName = name;
  }
  if (input.username !== undefined) {
    const username = input.username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(username)) throw new Error('Usernames are 3–20 letters, numbers or _');
    const taken = await prisma.user.findFirst({ where: { username, NOT: { id: userId } }, select: { id: true } });
    if (taken) throw new Error('That username is taken. Try another.');
    data.username = username;
  }
  if (input.phone_number !== undefined) {
    // Nigerian numbers only, stored as +234XXXXXXXXXX (same as registration).
    const digits = input.phone_number.replace(/\D/g, '');
    const phone = digits.startsWith('234') ? `+${digits}` : digits.startsWith('0') ? `+234${digits.slice(1)}` : `+234${digits}`;
    if (!/^\+234[789][01]\d{8}$/.test(phone)) throw new Error('Enter a valid Nigerian phone number');
    const taken = await prisma.user.findFirst({ where: { phoneNumber: phone, NOT: { id: userId } }, select: { id: true } });
    if (taken) throw new Error('That number is already on another account');
    data.phoneNumber = phone;
  }
  if (input.avatar_url !== undefined) data.avatarUrl = input.avatar_url || null;
  if (!Object.keys(data).length) throw new Error('Nothing to update');
  await prisma.user.update({ where: { id: userId }, data: { ...data, updatedAt: new Date() } });
};
