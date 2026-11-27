import prisma from '../../config/prisma';
import logger from '../../utils/logger';
import { bidderLabel } from '../../utils/bidderLabel';
import * as biddingService from '../bidding/bidding.service';
import * as auctionService from '../auction/auction.service';
import * as socketService from '../socket/socket.service';
import * as notificationService from '../notification/notification.service';

/**
 * Auto-bid (proxy bidding). A user sets a maximum; whenever they're outbid the system bids for
 * them one increment above the strongest rival, until their maximum is reached. Every auto bid
 * goes through placeBid, so wallet holds, minimum steps and anti-snipe extensions all apply.
 */

const toNum = (v: unknown) => Number(v ?? 0);

/** One resolution per auction at a time, so two bids can't race each other's auto-bids. */
const locks = new Map<string, Promise<void>>();

const announce = async (
  auctionId: string,
  bidderId: string,
  amount: number,
  bid: unknown,
  previousHighBidderId?: string
) => {
  const auction: any = await auctionService.getAuctionById(auctionId);
  socketService.emitToAuction(auctionId, 'bid:placed', {
    bid,
    bidder: { id: bidderId, full_name: bidderLabel(bidderId) },
    amount,
    timestamp: new Date(),
    totalBids: auction?.total_bids || auction?.bid_count || 0,
    currentPrice: auction?.current_price || amount,
    isAutoBid: true,
  });
  if (previousHighBidderId && previousHighBidderId !== bidderId) {
    socketService.emitToUser(previousHighBidderId, 'bid:outbid', {
      auctionId,
      newHighestBid: amount,
      message: `You've been outbid! New highest bid: ₦${amount.toLocaleString()}`,
    });
    notificationService
      .notifyOutbidForAuction(previousHighBidderId, auctionId, amount)
      .catch(err => logger.error('Outbid notification failed:', err));
  }
};

const retire = async (autoBidId: string, userId: string, auctionId: string, maxAmount: number, why: string) => {
  const updated = await prisma.autoBid.update({
    where: { id: autoBidId },
    data: { isActive: false, updatedAt: new Date() },
  });
  // "Tell me when I hit my max" off: stay quiet about the limit (errors are always reported).
  if (why === 'limit' && !updated.notifyOnMax) return;
  const rows = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { gadget: { select: { title: true } } },
  });
  const title = rows?.gadget?.title || 'an item';
  await notificationService
    .createNotification(
      userId,
      'outbid',
      why === 'limit' ? 'Auto-bid reached your max' : 'Auto-bid stopped',
      why === 'limit'
        ? `${title} · your max was ₦${maxAmount.toLocaleString()}. Raise it to stay in.`
        : `${title} · your auto-bid couldn't place a bid: ${why}`,
      { auctionId, autoBidMax: maxAmount },
      ['push']
    )
    .catch(err => logger.error('Auto-bid notification failed:', err));
};

const resolveOnce = async (auctionId: string): Promise<boolean> => {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { status: true, endTime: true, currentPrice: true, bidIncrement: true, totalBids: true },
  });
  if (!auction || auction.status !== 'active' || auction.endTime <= new Date()) return false;

  const price = toNum(auction.currentPrice);
  const inc = toNum(auction.bidIncrement) || 100;
  const leader = await prisma.bid.findFirst({
    where: { auctionId, isWinning: true },
    select: { bidderId: true },
  });
  const leaderId = leader?.bidderId ?? null;
  const hasBids = (auction.totalBids ?? 0) > 0 && !!leaderId;
  // placeBid always requires current price + one step, even for the first bid.
  const minNext = price + inc;

  const autos = await prisma.autoBid.findMany({
    where: { auctionId, isActive: true },
    orderBy: [{ maxAmount: 'desc' }, { createdAt: 'asc' }],
  });

  // Anyone (other than the leader) whose limit no longer covers the next step is done.
  for (const a of autos) {
    if (a.userId !== leaderId && toNum(a.maxAmount) < minNext) {
      await retire(a.id, a.userId, auctionId, toNum(a.maxAmount), 'limit');
    }
  }
  const live = autos.filter(a => a.userId === leaderId || toNum(a.maxAmount) >= minNext);
  const challengers = live.filter(a => a.userId !== leaderId);
  if (!challengers.length) return false;

  const top = challengers[0];
  const topMax = toNum(top.maxAmount);
  const leaderAuto = live.find(a => a.userId === leaderId);
  const leaderMax = leaderAuto ? toNum(leaderAuto.maxAmount) : price;
  const nextRival = challengers[1] ? toNum(challengers[1].maxAmount) : 0;

  if (leaderAuto && leaderMax >= topMax) {
    // The leader's limit wins (ties go to whoever set it first). Lift them just past the challenger.
    const target = Math.min(leaderMax, topMax + inc);
    if (target >= price + inc) {
      await placeFor(leaderAuto.userId, auctionId, target, leaderAuto.id, leaderMax);
    }
    await retire(top.id, top.userId, auctionId, topMax, 'limit');
    return true;
  }

  // The top challenger takes the lead: one step past the strongest rival, capped at their limit.
  const rivalCeiling = Math.max(hasBids ? leaderMax : price, nextRival);
  const target = Math.max(minNext, Math.min(topMax, rivalCeiling + inc));
  if (target > topMax) return false;
  const placed = await placeFor(top.userId, auctionId, target, top.id, topMax);
  if (placed && leaderAuto) await retire(leaderAuto.id, leaderAuto.userId, auctionId, leaderMax, 'limit');
  return placed;
};

const placeFor = async (userId: string, auctionId: string, amount: number, autoBidId: string, max: number) => {
  try {
    const { bid, previousHighBidderId } = await biddingService.placeBid(
      userId,
      { auction_id: auctionId, amount },
      { isAutoBid: true }
    );
    await announce(auctionId, userId, amount, bid, previousHighBidderId);
    return true;
  } catch (err: any) {
    logger.warn(`Auto-bid ${autoBidId} could not bid ₦${amount}: ${err?.message}`);
    await retire(autoBidId, userId, auctionId, max, err?.message || 'unknown error');
    return false;
  }
};

/** Run after any bid (manual or auto) and whenever someone sets an auto-bid. Never throws. */
export const resolveAutoBids = (auctionId: string): Promise<void> => {
  const run = async () => {
    try {
      // Each pass settles one contest; a handful covers three-way fights.
      for (let i = 0; i < 6 && (await resolveOnce(auctionId)); i++);
    } catch (err) {
      logger.error(`Auto-bid resolution failed for ${auctionId}:`, err);
    }
  };
  const next = (locks.get(auctionId) ?? Promise.resolve()).then(run);
  locks.set(auctionId, next);
  next.finally(() => {
    if (locks.get(auctionId) === next) locks.delete(auctionId);
  });
  return next;
};

export const setAutoBid = async (
  userId: string,
  auctionId: string,
  maxAmount: number,
  notifyOnMax = true
) => {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: {
      status: true,
      endTime: true,
      currentPrice: true,
      bidIncrement: true,
      sellerId: true,
      gadget: { select: { sellerId: true } },
    },
  });
  if (!auction) throw new Error('Auction not found');
  if (auction.status !== 'active' || auction.endTime <= new Date()) {
    throw new Error('Auto-bid can only be set on a live auction');
  }
  if (auction.sellerId === userId || auction.gadget?.sellerId === userId) {
    throw new Error('You cannot bid on your own auction');
  }
  const minimum = toNum(auction.currentPrice) + (toNum(auction.bidIncrement) || 100);
  if (maxAmount < minimum) {
    throw new Error(`Your maximum must be at least ₦${minimum.toLocaleString()}`);
  }

  const autoBid = await prisma.autoBid.upsert({
    where: { userId_auctionId: { userId, auctionId } },
    create: { userId, auctionId, maxAmount, notifyOnMax },
    update: { maxAmount, notifyOnMax, isActive: true, updatedAt: new Date() },
  });
  await resolveAutoBids(auctionId);
  return getAutoBid(userId, auctionId) ?? autoBid;
};

export const cancelAutoBid = async (userId: string, auctionId: string) => {
  await prisma.autoBid.updateMany({
    where: { userId, auctionId, isActive: true },
    data: { isActive: false, updatedAt: new Date() },
  });
};

export const getAutoBid = async (userId: string, auctionId: string) => {
  const a = await prisma.autoBid.findUnique({ where: { userId_auctionId: { userId, auctionId } } });
  return a
    ? { auction_id: a.auctionId, max_amount: toNum(a.maxAmount), is_active: a.isActive, notify_on_max: a.notifyOnMax }
    : null;
};
