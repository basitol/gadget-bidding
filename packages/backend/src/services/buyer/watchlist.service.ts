import prisma from '../../config/prisma';
import { AUCTION_CARD_INCLUDE, toAuctionCard } from './card';

export type WatchFilter = 'all' | 'ending_soon' | 'starting_soon';
/** "Ending soon" on the Watchlist tab: live and closing within this window. */
const ENDING_SOON_HOURS = 3;

export const watch = async (userId: string, auctionId: string) => {
  const exists = await prisma.auction.findUnique({ where: { id: auctionId }, select: { id: true } });
  if (!exists) throw new Error('Auction not found');
  await prisma.watch.upsert({
    where: { userId_auctionId: { userId, auctionId } },
    create: { userId, auctionId },
    update: {},
  });
};

export const unwatch = async (userId: string, auctionId: string) => {
  await prisma.watch.deleteMany({ where: { userId, auctionId } });
};

export const watchedIds = async (userId: string): Promise<string[]> =>
  (await prisma.watch.findMany({ where: { userId }, select: { auctionId: true } })).map(w => w.auctionId);

/** Watched auctions that haven't finished, soonest first, plus counts for the tabs. */
export const list = async (userId: string, filter: WatchFilter = 'all') => {
  const rows = await prisma.watch.findMany({
    where: { userId, auction: { status: { in: ['active', 'scheduled'] } } },
    include: { auction: { include: AUCTION_CARD_INCLUDE } },
  });
  const now = Date.now();
  const soon = now + ENDING_SOON_HOURS * 3600_000;
  const cards = rows.map(r => toAuctionCard(r.auction));
  const isEnding = (c: ReturnType<typeof toAuctionCard>) =>
    c.status === 'active' && new Date(c.end_time).getTime() <= soon;
  const isStarting = (c: ReturnType<typeof toAuctionCard>) => c.status === 'scheduled';

  const sortKey = (c: ReturnType<typeof toAuctionCard>) =>
    new Date(c.status === 'scheduled' ? c.start_time : c.end_time).getTime();
  const pick =
    filter === 'ending_soon' ? cards.filter(isEnding) : filter === 'starting_soon' ? cards.filter(isStarting) : cards;

  return {
    auctions: pick.sort((a, b) => sortKey(a) - sortKey(b)),
    counts: {
      all: cards.length,
      ending_soon: cards.filter(isEnding).length,
      starting_soon: cards.filter(isStarting).length,
    },
  };
};

/** Users watching an auction (for "ending soon" alerts). */
export const watchersOf = async (auctionId: string): Promise<string[]> =>
  (await prisma.watch.findMany({ where: { auctionId }, select: { userId: true } })).map(w => w.userId);
