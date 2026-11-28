import prisma from '../../config/prisma';
import {
  Auction,
  CreateAuctionRequest,
  AuctionStatus,
  AuctionWithGadget,
  listingDisclosures,
} from '@gadget-bidding/shared';
import logger from '../../utils/logger';
import config from '../../config';
import * as notificationService from '../notification/notification.service';
import { sellerCode } from '../buyer/sellerSummary.service';

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
  delivery_fee: config.deliveryFee,
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

    // A gadget can be auctioned again after a run that didn't sell, but only one run at a time.
    const openAuction = await tx.auction.findFirst({
      where: { gadgetId: data.gadget_id, status: { in: ['scheduled', 'active'] } },
      select: { id: true },
    });

    if (openAuction) {
      throw new Error('This gadget is already up for auction');
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
  notifyRelisted(createdAuction.id, data.gadget_id, createdGadgetTitle).catch(error => {
    logger.error('Failed to send relist alerts:', error);
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
      // Listing-flow repairs, damage and faults as "Buyers will see" lines (empty for older listings).
      disclosures: listingDisclosures(auction.gadget.specifications as any),
      // "Add a note for bidders": only once our team has checked it (never the pending one).
      bidder_note: auction.gadget.bidderNote ?? null,
    },
    // Buyers only ever see a seller's code ("Verified seller CV-1042"), never a name or photo.
    seller: {
      id: auction.seller?.id,
      full_name: auction.seller?.id ? sellerCode(auction.seller.id) : undefined,
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
  /** Gadget brand, exact (case-insensitive): "Apple", "Samsung". */
  brand?: string;
  /** Gadget conditions to include: new, like_new, excellent (Grade A), good (B), fair (C). */
  condition?: string[];
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

  if (filters.brand) {
    gadgetWhere.brand = { equals: filters.brand, mode: 'insensitive' };
  }
  if (filters.condition?.length) {
    gadgetWhere.condition = { in: filters.condition };
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
        full_name: auction.sellerId ? sellerCode(auction.sellerId) : undefined,
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

    // Scheduled auctions can change anything; a live one only its prices, and only before the first bid.
    const liveNoBids = auction.status === 'active' && (auction.totalBids ?? 0) === 0;
    if (auction.status !== 'scheduled' && !liveNoBids) {
      throw new Error(
        auction.status === 'active' ? "This listing has bids, so it can't be changed now" : 'Can only update scheduled auctions'
      );
    }
    if (liveNoBids && (updates.start_time || updates.end_time)) {
      throw new Error("A live listing's times can't change. You can change its prices or end it.");
    }
    if (liveNoBids && (await tx.bid.count({ where: { auctionId } })) > 0) {
      throw new Error("This listing has bids, so it can't be changed now");
    }
    const nextStart = Number(updates.starting_price ?? auction.startingPrice);
    const nextBuyNow =
      updates.buy_now_price !== undefined ? updates.buy_now_price : auction.buyNowPrice != null ? Number(auction.buyNowPrice) : null;
    if (nextBuyNow != null && Number(nextBuyNow) <= nextStart) {
      throw new Error('The buy-now price has to be higher than the starting price');
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

/** "The seller may relist it, we'll tell you": bidders and watchers of earlier unsold runs of this gadget. */
const notifyRelisted = async (auctionId: string, gadgetId: string, title: string) => {
  const previous = await prisma.auction.findMany({
    where: { gadgetId, id: { not: auctionId }, winnerId: null, status: { in: ['ended', 'cancelled'] } },
    select: { id: true, sellerId: true },
  });
  if (!previous.length) return;
  const ids = previous.map(p => p.id);
  const [watchers, bidders] = await Promise.all([
    prisma.watch.findMany({ where: { auctionId: { in: ids } }, select: { userId: true } }),
    prisma.bid.findMany({ where: { auctionId: { in: ids } }, select: { bidderId: true }, distinct: ['bidderId'] }),
  ]);
  const people = new Set<string>([
    ...watchers.map(w => w.userId),
    ...bidders.map(b => b.bidderId).filter((id): id is string => !!id),
  ]);
  previous.forEach(p => p.sellerId && people.delete(p.sellerId));
  for (const userId of people) await notificationService.notifyAuctionRelisted(userId, auctionId, title);
};

const MAX_RELIST_HOURS = 7 * 24;

/**
 * Put an unsold gadget up again: same settings as the last run (its length, starting price,
 * reserve, bid step, buy-now), starting now. The seller may change the starting price, the
 * reserve or the run length. Not allowed after a sale, while another run is open, or when the
 * team stopped it.
 */
export const relistAuction = async (
  sellerId: string,
  auctionId: string,
  changes: { starting_price?: number; reserve_price?: number | null; duration_hours?: number } = {}
): Promise<Auction> => {
  const last = await prisma.auction.findFirst({
    where: { id: auctionId, sellerId },
    include: { gadget: { select: { id: true, status: true } } },
  });
  if (!last || !last.gadget) throw new Error('Auction not found');
  if (last.status !== 'ended' && last.status !== 'cancelled') {
    throw new Error('This auction hasn\'t ended yet');
  }
  if (last.winnerId) throw new Error('This gadget sold, so it can\'t be relisted');
  if (last.gadget.status !== 'approved') {
    throw new Error(
      last.gadget.status === 'listed' ? 'This gadget is already up for auction' : 'This gadget can\'t be relisted right now'
    );
  }
  const stoppedByTeam = await prisma.auditLog.findFirst({
    where: { action: 'auction_cancel', resourceId: auctionId },
    select: { id: true },
  });
  if (stoppedByTeam) throw new Error('Our team stopped this auction. Contact support to list it again.');

  const startingPrice = changes.starting_price ?? toNumber(last.startingPrice);
  const reserve =
    changes.reserve_price === null ? null : changes.reserve_price ?? (last.reservePrice == null ? null : toNumber(last.reservePrice));
  const hours = Math.min(
    MAX_RELIST_HOURS,
    Math.max(1, changes.duration_hours ?? Math.round((last.endTime.getTime() - last.startTime.getTime()) / 3_600_000))
  );
  const now = Date.now();

  return createAuction(sellerId, {
    gadget_id: last.gadget.id,
    starting_price: startingPrice,
    reserve_price: reserve ?? undefined,
    bid_increment: toNumber(last.bidIncrement) || undefined,
    buy_now_price: last.buyNowPrice == null ? undefined : toNumber(last.buyNowPrice),
    start_time: new Date(now).toISOString(),
    // A minute of slack so a 1-hour run still clears the 1-hour minimum once it's created.
    end_time: new Date(now + hours * 3_600_000 + 60_000).toISOString(),
    auto_extend_enabled: last.autoExtendEnabled ?? true,
    auto_extend_minutes: last.autoExtendMinutes ?? undefined,
  } as any);
};

/**
 * What's live right now, for browsing: auctions per category, and per brand inside one
 * category (for the brand chips on a category page).
 */
export const getLiveFacets = async (categorySlug?: string) => {
  const live = await prisma.auction.findMany({
    where: { status: 'active', endTime: { gt: new Date() } },
    select: { gadget: { select: { brand: true, category: { select: { slug: true, name: true } } } } },
  });
  const categories = new Map<string, { slug: string; name: string; count: number }>();
  const brands = new Map<string, { brand: string; count: number }>();
  let total = 0;
  for (const a of live) {
    const c = a.gadget?.category;
    if (c?.slug) {
      const row = categories.get(c.slug) ?? { slug: c.slug, name: c.name, count: 0 };
      row.count += 1;
      categories.set(c.slug, row);
    }
    if (categorySlug && c?.slug === categorySlug) {
      total += 1;
      const b = a.gadget?.brand?.trim();
      if (b) {
        const key = b.toLowerCase();
        const row = brands.get(key) ?? { brand: b, count: 0 };
        row.count += 1;
        brands.set(key, row);
      }
    }
  }
  return {
    categories: [...categories.values()].sort((x, y) => y.count - x.count),
    category: categorySlug ? { slug: categorySlug, live: total, brands: [...brands.values()].sort((x, y) => y.count - x.count) } : null,
  };
};
