import prisma from '../../config/prisma';
import {
  Auction,
  CreateAuctionRequest,
  AuctionStatus,
  AuctionWithGadget,
} from '@gadget-bidding/shared';
import logger from '../../utils/logger';
import config from '../../config';
import * as notificationService from '../notification/notification.service';

// Helper to convert Prisma Decimal to number
const toNumber = (value: any): number => {
  if (!value) return 0;
  return parseFloat(value.toString());
};

// Helper to transform Prisma auction to shared Auction type
// reserve_price is private (only the seller/admin should see it), so it is
// omitted by default and included explicitly for owner-facing responses.
const transformAuction = (
  auction: any,
  options: { includeReserve?: boolean } = {}
): Auction => ({
  id: auction.id,
  gadget_id: auction.gadgetId,
  seller_id: auction.sellerId,
  starting_price: toNumber(auction.startingPrice),
  ...(options.includeReserve
    ? { reserve_price: toNumber(auction.reservePrice) }
    : {}),
  current_price: toNumber(auction.currentPrice),
  bid_increment: toNumber(auction.bidIncrement),
  buy_now_price: toNumber(auction.buyNowPrice),
  start_time: auction.startTime?.toISOString(),
  end_time: auction.endTime?.toISOString(),
  status: auction.status as AuctionStatus,
  winner_id: auction.winnerId,
  total_bids: auction.totalBids || 0,
  auto_extend_enabled: auction.autoExtendEnabled,
  auto_extend_minutes: auction.autoExtendMinutes,
  created_at: auction.createdAt?.toISOString(),
  updated_at: auction.updatedAt?.toISOString(),
});

/**
 * Create a new auction
 */
export const createAuction = async (
  sellerId: string,
  data: CreateAuctionRequest
): Promise<Auction> => {
  let createdGadgetTitle = 'A gadget';

  const createdAuction = await prisma.$transaction(async tx => {
    // Verify gadget ownership and approval
    const gadget = await tx.gadget.findFirst({
      where: {
        id: data.gadget_id,
        sellerId,
        status: 'approved',
      },
    });

    if (!gadget) {
      throw new Error('Gadget not found, not owned by you, or not approved');
    }

    createdGadgetTitle = gadget.title;

    // Check if gadget already has an auction
    const existingAuction = await tx.auction.findUnique({
      where: { gadgetId: data.gadget_id },
    });

    if (existingAuction) {
      throw new Error('Gadget already has an auction');
    }

    // Validate dates
    const requestedStart = new Date(data.start_time);
    const endTime = new Date(data.end_time);
    const now = new Date();

    // Allow "start immediately" despite network delay / clock skew
    const PAST_GRACE_MS = 60_000;
    if (requestedStart.getTime() < now.getTime() - PAST_GRACE_MS) {
      throw new Error('Start time must be in the future');
    }

    // Treat now / near-future (≤30s) as go-live immediately
    const IMMEDIATE_WINDOW_MS = 30_000;
    const startTime =
      requestedStart.getTime() <= now.getTime() + IMMEDIATE_WINDOW_MS
        ? now
        : requestedStart;

    if (endTime <= startTime) {
      throw new Error('End time must be after start time');
    }

    // Set minimum duration (e.g., 1 hour)
    const minDuration = 60 * 60 * 1000;
    if (endTime.getTime() - startTime.getTime() < minDuration) {
      throw new Error('Auction must run for at least 1 hour');
    }

    // Validate reserve price
    if (data.reserve_price && data.reserve_price < data.starting_price) {
      throw new Error(
        'Reserve price must be greater than or equal to starting price'
      );
    }

    // Validate buy now price
    if (data.buy_now_price && data.buy_now_price < data.starting_price) {
      throw new Error('Buy now price must be greater than starting price');
    }

    // Determine auction status
    const status: AuctionStatus = startTime <= now ? 'active' : 'scheduled';

    // Create auction
    const auction = await tx.auction.create({
      data: {
        gadgetId: data.gadget_id,
        sellerId,
        startingPrice: data.starting_price,
        reservePrice: data.reserve_price || null,
        currentPrice: data.starting_price,
        bidIncrement: data.bid_increment || config.minBidIncrement,
        buyNowPrice: data.buy_now_price || null,
        startTime,
        endTime,
        status,
        autoExtendEnabled: data.auto_extend_enabled !== false,
        autoExtendMinutes: data.auto_extend_minutes || config.autoExtendMinutes,
      },
    });

    // Update gadget status to listed
    await tx.gadget.update({
      where: { id: data.gadget_id },
      data: { status: 'listed' },
    });

    logger.info(`Auction created: ${auction.id} by ${sellerId}`);

    return transformAuction(auction, { includeReserve: true });
  });

  notificationService
    .notifyBackofficeAuctionCreated(createdAuction.id, createdGadgetTitle)
    .catch(error => {
      logger.error('Failed to notify backoffice about new auction:', error);
    });

  return createdAuction;
};

/**
 * Get auction by ID with gadget details
 */
export const getAuctionById = async (
  auctionId: string
): Promise<AuctionWithGadget | null> => {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      gadget: {
        include: {
          category: true,
        },
      },
      seller: {
        select: {
          id: true,
          fullName: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!auction || !auction.gadget) {
    return null;
  }

  return {
    ...transformAuction(auction),
    gadget: {
      id: auction.gadget.id,
      title: auction.gadget.title,
      description: auction.gadget.description,
      brand: auction.gadget.brand,
      model: auction.gadget.model,
      condition: auction.gadget.condition,
      specifications: auction.gadget.specifications,
      images: auction.gadget.images,
      category_name: auction.gadget.category?.name,
      category_slug: auction.gadget.category?.slug,
    },
    seller: {
      id: auction.seller?.id,
      full_name: auction.seller?.fullName,
      avatar_url: auction.seller?.avatarUrl,
    },
  } as unknown as AuctionWithGadget;
};

/**
 * Get auctions with filters and pagination
 */
export const getAuctions = async (filters: {
  category_id?: string;
  category?: string;
  status?: AuctionStatus;
  seller_id?: string;
  search?: string;
  min_price?: number;
  max_price?: number;
  sort_by?: string;
  page?: number;
  limit?: number;
  includeReserve?: boolean;
}): Promise<{ auctions: AuctionWithGadget[]; total: number }> => {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  // Build where conditions
  const where: any = {};

  // Public browse defaults to live/upcoming only.
  // Seller "my auctions" returns all statuses unless a status is passed.
  if (filters.status) {
    where.status = filters.status;
  } else if (!filters.seller_id) {
    where.status = { in: ['active', 'scheduled'] };
  }

  if (filters.seller_id) {
    where.sellerId = filters.seller_id;
  }

  if (filters.min_price || filters.max_price) {
    where.currentPrice = {};
    if (filters.min_price) where.currentPrice.gte = filters.min_price;
    if (filters.max_price) where.currentPrice.lte = filters.max_price;
  }

  // Gadget-related filters
  const gadgetWhere: any = {};

  if (filters.category_id) {
    gadgetWhere.categoryId = filters.category_id;
  } else if (filters.category) {
    gadgetWhere.category = {
      OR: [
        { name: { contains: filters.category, mode: 'insensitive' } },
        { slug: { contains: filters.category, mode: 'insensitive' } },
      ],
    };
  }

  if (filters.search) {
    gadgetWhere.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
      { brand: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (Object.keys(gadgetWhere).length > 0) {
    where.gadget = gadgetWhere;
  }

  // Determine sort order
  let orderBy: any = { createdAt: 'desc' };
  if (filters.sort_by === 'price_asc') {
    orderBy = { currentPrice: 'asc' };
  } else if (filters.sort_by === 'price_desc') {
    orderBy = { currentPrice: 'desc' };
  } else if (
    filters.sort_by === 'ending_soon' ||
    filters.sort_by === 'end_time'
  ) {
    orderBy = { endTime: 'asc' };
  } else if (filters.sort_by === 'bid_count') {
    orderBy = { totalBids: 'desc' };
  }

  // Execute queries
  const [auctions, total] = await Promise.all([
    prisma.auction.findMany({
      where,
      include: {
        gadget: {
          include: {
            category: true,
          },
        },
        seller: {
          select: {
            fullName: true,
          },
        },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.auction.count({ where }),
  ]);

  // Transform results
  const transformedAuctions = auctions.map(auction => {
    const now = new Date();
    const endTime = auction.endTime;
    const secondsRemaining = endTime
      ? Math.max(0, (endTime.getTime() - now.getTime()) / 1000)
      : 0;

    return {
      ...transformAuction(auction, { includeReserve: filters.includeReserve }),
      seconds_remaining: secondsRemaining,
      gadget: auction.gadget
        ? {
            id: auction.gadget.id,
            title: auction.gadget.title,
            images: auction.gadget.images,
            condition: auction.gadget.condition,
            category_name: auction.gadget.category?.name,
          }
        : null,
      seller: {
        full_name: auction.seller?.fullName,
      },
    };
  });

  return { auctions: transformedAuctions as any, total };
};

/**
 * Update auction (limited fields before it starts)
 */
export const updateAuction = async (
  auctionId: string,
  sellerId: string,
  updates: Partial<CreateAuctionRequest>
): Promise<Auction> => {
  return prisma.$transaction(async tx => {
    // Verify ownership
    const auction = await tx.auction.findFirst({
      where: { id: auctionId, sellerId },
    });

    if (!auction) {
      throw new Error('Auction not found or unauthorized');
    }

    // Can only update scheduled auctions
    if (auction.status !== 'scheduled') {
      throw new Error('Can only update scheduled auctions');
    }

    // Build update data
    const updateData: any = {};

    if (updates.starting_price) {
      updateData.startingPrice = updates.starting_price;
      updateData.currentPrice = updates.starting_price;
    }

    if (updates.reserve_price !== undefined) {
      updateData.reservePrice = updates.reserve_price;
    }

    if (updates.buy_now_price !== undefined) {
      updateData.buyNowPrice = updates.buy_now_price;
    }

    if (updates.start_time) {
      updateData.startTime = new Date(updates.start_time);
    }

    if (updates.end_time) {
      updateData.endTime = new Date(updates.end_time);
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error('No fields to update');
    }

    const updatedAuction = await tx.auction.update({
      where: { id: auctionId },
      data: updateData,
    });

    logger.info(`Auction updated: ${auctionId}`);

    return transformAuction(updatedAuction, { includeReserve: true });
  });
};

/**
 * Cancel auction
 */
export const cancelAuction = async (
  auctionId: string,
  sellerId: string,
  options?: { force?: boolean; asAdmin?: boolean }
): Promise<void> => {
  return prisma.$transaction(async tx => {
    // Get auction
    const auction = await tx.auction.findFirst({
      where: options?.asAdmin
        ? { id: auctionId }
        : { id: auctionId, sellerId },
    });

    if (!auction) {
      throw new Error('Auction not found or unauthorized');
    }

    if (auction.status === 'cancelled' || auction.status === 'ended') {
      throw new Error(`Cannot cancel an auction that is already ${auction.status}`);
    }

    // Can only cancel scheduled auctions or active auctions with no bids
    // Admins may force-cancel active auctions with bids.
    if (!options?.force && auction.status !== 'scheduled') {
      const bidsCount = await tx.bid.count({
        where: { auctionId },
      });

      if (bidsCount > 0) {
        throw new Error('Cannot cancel auction with existing bids');
      }
    }

    // Cancel auction
    await tx.auction.update({
      where: { id: auctionId },
      data: { status: 'cancelled' },
    });

    // Update gadget status back to approved
    if (auction.gadgetId) {
      await tx.gadget.update({
        where: { id: auction.gadgetId },
        data: { status: 'approved' },
      });
    }

    logger.info(
      `Auction cancelled: ${auctionId}${options?.asAdmin ? ' (admin)' : ''}`
    );
  });
};

/**
 * Get seller's auctions
 */
export const getSellerAuctions = async (
  sellerId: string,
  page: number = 1,
  limit: number = 20
): Promise<{ auctions: AuctionWithGadget[]; total: number }> => {
  return getAuctions({ seller_id: sellerId, page, limit, includeReserve: true });
};

/**
 * Get active auctions count
 */
export const getActiveAuctionsCount = async (): Promise<number> => {
  return prisma.auction.count({
    where: { status: 'active' },
  });
};
