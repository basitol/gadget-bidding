import prisma from '../../config/prisma';
import {
  BID_COMMITMENT_AMOUNT,
  Bid,
  BidStatus,
  BidWithBidder,
  PlaceBidRequest,
} from '@gadget-bidding/shared';
import * as walletService from '../wallet/wallet.service';
import logger from '../../utils/logger';
import config from '../../config';

// Helper to convert Prisma Decimal to number
const toNumber = (value: any): number => {
  if (!value) return 0;
  return parseFloat(value.toString());
};

// Helper to transform Prisma bid to shared Bid type
const transformBid = (bid: any): Bid => ({
  id: bid.id,
  auction_id: bid.auctionId,
  bidder_id: bid.bidderId,
  amount: toNumber(bid.amount),
  bid_time: bid.bidTime?.toISOString(),
  is_winning: bid.isWinning || false,
  is_auto_bid: bid.isAutoBid || false,
  status: bid.status as BidStatus,
});

/**
 * Place a bid on an auction
 */
export const placeBid = async (
  bidderId: string,
  data: PlaceBidRequest
): Promise<{ bid: Bid; previousHighBidderId?: string }> => {
  return prisma.$transaction(async tx => {
    // Get auction with gadget
    const auction = await tx.auction.findUnique({
      where: { id: data.auction_id },
      include: { gadget: true },
    });

    if (!auction) {
      throw new Error('Auction not found');
    }

    // Validate auction status
    if (auction.status !== 'active') {
      throw new Error('Auction is not active');
    }

    // Check if auction has ended
    const now = new Date();
    if (auction.endTime <= now) {
      throw new Error('Auction has ended');
    }

    // Prevent seller from bidding on their own auction
    if (auction.gadget?.sellerId === bidderId) {
      throw new Error('You cannot bid on your own auction');
    }

    // Validate bid amount
    const currentPrice = toNumber(auction.currentPrice);
    const bidIncrement = toNumber(auction.bidIncrement);
    const minimumBid = currentPrice + bidIncrement;

    if (data.amount < minimumBid) {
      throw new Error(`Minimum bid is ₦${minimumBid.toLocaleString()}`);
    }

    // Get current highest bidder (to notify them of outbid)
    let previousHighBidderId: string | undefined;
    const currentHighBid = await tx.bid.findFirst({
      where: { auctionId: data.auction_id, isWinning: true },
      select: { bidderId: true },
    });

    if (currentHighBid?.bidderId) {
      previousHighBidderId = currentHighBid.bidderId;
    }

    // Mark all previous bids as not winning
    await tx.bid.updateMany({
      where: { auctionId: data.auction_id, isWinning: true },
      data: { isWinning: false, status: 'outbid' },
    });

    // Check if this bidder already has an active bid hold on this auction
    const previousBidHold = await tx.bidHold.findFirst({
      where: {
        bid: { auctionId: data.auction_id, bidderId },
        status: 'held',
      },
      include: { wallet: true },
    });

    /* Unused redundant release code:
    if (previousBidHold) {
      await tx.bidHold.update({
        where: { id: previousBidHold.id },
        data: { status: 'released', releasedAt: new Date() },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: previousBidHold.walletId!,
          transactionType: 'bid_release',
          amount: toNumber(previousBidHold.amount),
          balanceBefore: 0,
          balanceAfter: 0,
          description: 'Released hold for outbid',
          status: 'completed',
        },
      });
    }
    */

    // Get wallet with held amounts
    const wallet = await tx.wallet.findUnique({
      where: { userId: bidderId },
      include: {
        bidHolds: {
          where: { status: 'held' },
          select: { amount: true },
        },
      },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const balance = toNumber(wallet.balance);
    const heldAmount = wallet.bidHolds.reduce(
      (sum, hold) => sum + toNumber(hold.amount),
      0
    );
    const actualAvailableBalance = balance - heldAmount;

    if (!previousBidHold && actualAvailableBalance < BID_COMMITMENT_AMOUNT) {
      throw new Error(
        `You need at least ₦${BID_COMMITMENT_AMOUNT.toLocaleString()} available in your wallet to bid. Available: ₦${actualAvailableBalance.toLocaleString()}`
      );
    }

    // Create new bid
    const bid = await tx.bid.create({
      data: {
        auctionId: data.auction_id,
        bidderId,
        amount: data.amount,
        isWinning: true,
        isAutoBid: false,
        status: 'active',
      },
    });

    if (previousBidHold) {
      // User already has a ₦1,000 hold active for this auction — re-link to new bid without creating duplicate transactions
      await tx.bidHold.update({
        where: { id: previousBidHold.id },
        data: { bidId: bid.id },
      });
    } else {
      // Create new bid hold and transaction
      await tx.bidHold.create({
        data: {
          bidId: bid.id,
          walletId: wallet.id,
          amount: BID_COMMITMENT_AMOUNT,
          status: 'held',
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          transactionType: 'bid_hold',
          amount: BID_COMMITMENT_AMOUNT,
          balanceBefore: balance,
          balanceAfter: balance,
          description: 'Commitment hold for bid on auction',
          status: 'completed',
        },
      });
    }

    // Update auction current price and bid count
    await tx.auction.update({
      where: { id: data.auction_id },
      data: {
        currentPrice: data.amount,
        totalBids: { increment: 1 },
      },
    });

    // Auto-extend auction if bid is placed near end time
    if (auction.autoExtendEnabled) {
      const endTime = auction.endTime;
      const timeRemaining = endTime.getTime() - now.getTime();
      const extendThreshold = (auction.autoExtendMinutes || 5) * 60 * 1000;

      if (timeRemaining <= extendThreshold) {
        const newEndTime = new Date(
          endTime.getTime() + (auction.autoExtendMinutes || 5) * 60 * 1000
        );

        await tx.auction.update({
          where: { id: data.auction_id },
          data: { endTime: newEndTime },
        });

        logger.info(
          `Auction ${data.auction_id} extended by ${auction.autoExtendMinutes} minutes`
        );
      }
    }

    logger.info(
      `Bid placed: ${bid.id} - ₦${data.amount} on auction ${data.auction_id} by ${bidderId}`
    );

    return { bid: transformBid(bid), previousHighBidderId };
  });
};

/**
 * Buy now - instantly win the auction
 */
export const buyNow = async (
  buyerId: string,
  auctionId: string
): Promise<Bid> => {
  logger.info(`BuyNow: Starting for buyer=${buyerId}, auction=${auctionId}`);

  return prisma.$transaction(async tx => {
    // Get auction with gadget
    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
      include: { gadget: true },
    });

    if (!auction) {
      logger.error('BuyNow: Auction not found');
      throw new Error('Auction not found');
    }

    logger.info(
      `BuyNow: Auction found - status=${auction.status}, buy_now_price=${auction.buyNowPrice}`
    );

    // Validate auction status
    if (auction.status !== 'active') {
      logger.error(`BuyNow: Auction not active - status=${auction.status}`);
      throw new Error('Auction is not active');
    }

    // Check if buy now is available
    if (!auction.buyNowPrice) {
      logger.error('BuyNow: Buy now price not set');
      throw new Error('Buy now is not available for this auction');
    }

    // Prevent seller from buying their own item
    if (auction.gadget?.sellerId === buyerId) {
      logger.error(`BuyNow: Seller trying to buy own item`);
      throw new Error('You cannot buy your own item');
    }

    const buyNowPrice = toNumber(auction.buyNowPrice);
    logger.info(`BuyNow: Buy now price = ${buyNowPrice}`);

    // NOTE: For Buy Now, we don't check wallet balance or create holds
    // Payment will be made via Paystack after order is created

    // Release any existing holds for this bidder on this auction (from previous bids)
    const previousBidHold = await tx.bidHold.findFirst({
      where: {
        bid: { auctionId, bidderId: buyerId },
        status: 'held',
      },
      include: { wallet: true },
    });

    if (previousBidHold) {
      await tx.bidHold.update({
        where: { id: previousBidHold.id },
        data: { status: 'released', releasedAt: new Date() },
      });
      logger.info(
        `BuyNow: Released previous bid hold of ${toNumber(previousBidHold.amount)}`
      );
    }

    // Mark all previous bids as outbid
    await tx.bid.updateMany({
      where: { auctionId },
      data: { isWinning: false, status: 'outbid' },
    });

    // Create winning bid (no hold needed - payment via Paystack)
    const bid = await tx.bid.create({
      data: {
        auctionId,
        bidderId: buyerId,
        amount: buyNowPrice,
        isWinning: true,
        isAutoBid: false,
        status: 'won',
      },
    });

    // End the auction immediately
    await tx.auction.update({
      where: { id: auctionId },
      data: {
        status: 'ended',
        currentPrice: buyNowPrice,
        winnerId: buyerId,
        totalBids: { increment: 1 },
        endTime: new Date(),
      },
    });

    // Release all other bid holds for this auction
    await tx.bidHold.updateMany({
      where: {
        bid: { auctionId, bidderId: { not: buyerId } },
        status: 'held',
      },
      data: { status: 'released', releasedAt: new Date() },
    });

    logger.info(
      `Buy now executed: ${bid.id} - ₦${buyNowPrice} on auction ${auctionId} by ${buyerId}`
    );

    return transformBid(bid);
  });
};

/**
 * Get bid by ID
 */
export const getBidById = async (
  bidId: string
): Promise<BidWithBidder | null> => {
  const bid = await prisma.bid.findUnique({
    where: { id: bidId },
    include: {
      bidder: {
        select: {
          id: true,
          fullName: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!bid) {
    return null;
  }

  return {
    ...transformBid(bid),
    bidder: {
      id: bid.bidder?.id,
      full_name: bid.bidder?.fullName,
      avatar_url: bid.bidder?.avatarUrl,
    },
  } as BidWithBidder;
};

/**
 * Get bids for an auction
 */
export const getAuctionBids = async (
  auctionId: string,
  page: number = 1,
  limit: number = 20
): Promise<{ bids: BidWithBidder[]; total: number }> => {
  const [bids, total] = await Promise.all([
    prisma.bid.findMany({
      where: { auctionId },
      include: {
        bidder: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ amount: 'desc' }, { bidTime: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.bid.count({ where: { auctionId } }),
  ]);

  return {
    bids: bids.map(bid => ({
      ...transformBid(bid),
      bidder: {
        id: bid.bidder?.id,
        full_name: bid.bidder?.fullName,
        avatar_url: bid.bidder?.avatarUrl,
      },
    })) as BidWithBidder[],
    total,
  };
};

/**
 * Get user's bids
 */
export const getUserBids = async (
  userId: string,
  page: number = 1,
  limit: number = 20,
  status?: BidStatus
): Promise<{ bids: any[]; total: number }> => {
  const where: any = { bidderId: userId };
  if (status) {
    where.status = status;
  }

  const [bids, total] = await Promise.all([
    prisma.bid.findMany({
      where,
      include: {
        auction: {
          include: {
            gadget: {
              select: {
                title: true,
                images: true,
              },
            },
          },
        },
      },
      orderBy: { bidTime: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.bid.count({ where }),
  ]);

  return {
    bids: bids.map(bid => ({
      ...transformBid(bid),
      auction_id: bid.auctionId,
      current_price: toNumber(bid.auction?.currentPrice),
      end_time: bid.auction?.endTime?.toISOString(),
      auction_status: bid.auction?.status,
      gadget_title: bid.auction?.gadget?.title,
      gadget_images: bid.auction?.gadget?.images,
    })),
    total,
  };
};

/**
 * Get user's active bids (currently winning)
 */
export const getUserActiveBids = async (userId: string): Promise<any[]> => {
  const bids = await prisma.bid.findMany({
    where: {
      bidderId: userId,
      isWinning: true,
      auction: { status: 'active' },
    },
    include: {
      auction: {
        include: {
          gadget: {
            select: {
              title: true,
              images: true,
            },
          },
        },
      },
      bidHold: {
        where: { status: 'held' },
        select: { amount: true },
      },
    },
    orderBy: { auction: { endTime: 'asc' } },
  });

  return bids.map(bid => ({
    ...transformBid(bid),
    auction_id: bid.auctionId,
    current_price: toNumber(bid.auction?.currentPrice),
    end_time: bid.auction?.endTime?.toISOString(),
    auction_status: bid.auction?.status,
    gadget_title: bid.auction?.gadget?.title,
    gadget_images: bid.auction?.gadget?.images,
    held_amount: bid.bidHold ? toNumber(bid.bidHold.amount) : null,
  }));
};

/**
 * Get highest bid for an auction
 */
export const getHighestBid = async (auctionId: string): Promise<Bid | null> => {
  const bid = await prisma.bid.findFirst({
    where: { auctionId, isWinning: true },
    orderBy: { amount: 'desc' },
  });

  return bid ? transformBid(bid) : null;
};

/**
 * End auction and determine winner
 */
export const endAuction = async (
  auctionId: string
): Promise<{
  winnerId?: string;
  finalPrice?: number;
  reserveMet: boolean;
}> => {
  return prisma.$transaction(async tx => {
    // Get auction
    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) {
      throw new Error('Auction not found');
    }

    // Only end active auctions
    if (auction.status !== 'active') {
      throw new Error('Auction is not active');
    }

    // Get winning bid
    const winningBid = await tx.bid.findFirst({
      where: { auctionId, isWinning: true },
    });

    let winnerId: string | undefined;
    let finalPrice: number | undefined;
    let reserveMet = true;

    if (winningBid) {
      winnerId = winningBid.bidderId || undefined;
      finalPrice = toNumber(winningBid.amount);

      // Check if reserve price was met
      if (auction.reservePrice) {
        const reservePrice = toNumber(auction.reservePrice);
        reserveMet = finalPrice >= reservePrice;
      }

      if (reserveMet) {
        // Mark winning bid as won
        await tx.bid.update({
          where: { id: winningBid.id },
          data: { status: 'won' },
        });

        // Update auction with winner
        await tx.auction.update({
          where: { id: auctionId },
          data: { status: 'ended', winnerId },
        });

        // Update gadget status to sold
        if (auction.gadgetId) {
          await tx.gadget.update({
            where: { id: auction.gadgetId },
            data: { status: 'sold' },
          });
        }

        // Release all non-winning bid holds
        const otherBidHolds = await tx.bidHold.findMany({
          where: {
            bid: { auctionId, id: { not: winningBid.id } },
            status: 'held',
          },
          select: { bid: { select: { id: true } } },
        });

        for (const hold of otherBidHolds) {
          if (hold.bid?.id) {
            await walletService.releaseHold(hold.bid.id);
          }
        }

        logger.info(
          `Auction ${auctionId} ended. Winner: ${winnerId}, Final price: ₦${finalPrice}`
        );
      } else {
        // Reserve not met - release all holds and cancel
        await tx.auction.update({
          where: { id: auctionId },
          data: { status: 'cancelled' },
        });

        if (auction.gadgetId) {
          await tx.gadget.update({
            where: { id: auction.gadgetId },
            data: { status: 'approved' },
          });
        }

        // Release all bid holds
        const allBidHolds = await tx.bidHold.findMany({
          where: {
            bid: { auctionId },
            status: 'held',
          },
          select: { bid: { select: { id: true } } },
        });

        for (const hold of allBidHolds) {
          if (hold.bid?.id) {
            await walletService.releaseHold(hold.bid.id);
          }
        }

        logger.info(
          `Auction ${auctionId} ended without winner - reserve price not met`
        );
      }
    } else {
      // No bids - end auction without winner
      await tx.auction.update({
        where: { id: auctionId },
        data: { status: 'ended' },
      });

      if (auction.gadgetId) {
        await tx.gadget.update({
          where: { id: auction.gadgetId },
          data: { status: 'approved' },
        });
      }

      logger.info(`Auction ${auctionId} ended with no bids`);
    }

    return { winnerId, finalPrice, reserveMet };
  });
};

/**
 * Get auctions ending soon (for background job)
 */
export const getAuctionsEndingSoon = async (
  withinMinutes: number = 5
): Promise<any[]> => {
  const now = new Date();
  const threshold = new Date(now.getTime() + withinMinutes * 60 * 1000);

  const auctions = await prisma.auction.findMany({
    where: {
      status: 'active',
      endTime: {
        lte: threshold,
        gt: now,
      },
    },
  });

  return auctions.map(a => ({
    id: a.id,
    gadget_id: a.gadgetId,
    seller_id: a.sellerId,
    end_time: a.endTime,
    status: a.status,
  }));
};

/**
 * Get expired auctions (for background job)
 */
export const getExpiredAuctions = async (): Promise<any[]> => {
  const auctions = await prisma.auction.findMany({
    where: {
      status: 'active',
      endTime: { lte: new Date() },
    },
  });

  return auctions.map(a => ({
    id: a.id,
    gadget_id: a.gadgetId,
    seller_id: a.sellerId,
    end_time: a.endTime,
    status: a.status,
  }));
};

/**
 * Activate scheduled auctions (for background job)
 */
export const activateScheduledAuctions = async (): Promise<number> => {
  const result = await prisma.auction.updateMany({
    where: {
      status: 'scheduled',
      startTime: { lte: new Date() },
    },
    data: { status: 'active' },
  });

  if (result.count > 0) {
    logger.info(`Activated ${result.count} scheduled auctions`);
  }

  return result.count;
};
