import { Request, Response } from 'express';
import { sendSuccess, sendError, sendPaginated } from '../../utils/response';
import * as auctionService from '../../services/auction/auction.service';
import logger from '../../utils/logger';

/**
 * Create a new auction
 * POST /api/v1/auctions
 */
export const createAuction = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const auctionData = req.body;
    const auction = await auctionService.createAuction(
      req.user.user_id,
      auctionData
    );

    sendSuccess(res, auction, 'Auction created successfully', 201);
  } catch (error: any) {
    logger.error('Create auction error:', error);
    sendError(res, error.message || 'Failed to create auction', 500);
  }
};

/**
 * Get auction by ID
 * GET /api/v1/auctions/:id
 */
export const getAuctionById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const auction = await auctionService.getAuctionById(id);

    if (!auction) {
      return sendError(res, 'Auction not found', 404);
    }

    sendSuccess(res, auction);
  } catch (error: any) {
    logger.error('Get auction error:', error);
    sendError(res, error.message || 'Failed to get auction', 500);
  }
};

/**
 * Get auctions with filters
 * GET /api/v1/auctions
 */
export const getAuctions = async (req: Request, res: Response) => {
  try {
    const filters = {
      category_id: req.query.category_id as string,
      category: req.query.category as string, // Support category name/slug
      status: req.query.status as any,
      seller_id: req.query.seller_id as string,
      search: req.query.search as string,
      min_price: req.query.min_price
        ? parseFloat(req.query.min_price as string)
        : undefined,
      max_price: req.query.max_price
        ? parseFloat(req.query.max_price as string)
        : undefined,
      sort_by: req.query.sort_by as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
    };

    const { auctions, total } = await auctionService.getAuctions(filters);

    sendPaginated(res, auctions, filters.page, filters.limit, total);
  } catch (error: any) {
    logger.error('Get auctions error:', error);
    sendError(res, error.message || 'Failed to get auctions', 500);
  }
};

/**
 * Update auction
 * PUT /api/v1/auctions/:id
 */
export const updateAuction = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { id } = req.params;
    const updates = req.body;

    const auction = await auctionService.updateAuction(
      id,
      req.user.user_id,
      updates
    );

    sendSuccess(res, auction, 'Auction updated successfully');
  } catch (error: any) {
    logger.error('Update auction error:', error);
    sendError(res, error.message || 'Failed to update auction', 500);
  }
};

/**
 * Cancel auction
 * POST /api/v1/auctions/:id/cancel
 */
export const cancelAuction = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { id } = req.params;

    await auctionService.cancelAuction(id, req.user.user_id);

    sendSuccess(res, null, 'Auction cancelled successfully');
  } catch (error: any) {
    logger.error('Cancel auction error:', error);
    sendError(res, error.message || 'Failed to cancel auction', 500);
  }
};

/**
 * Get seller's auctions
 * GET /api/v1/auctions/my-auctions
 */
export const getMyAuctions = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const { auctions, total } = await auctionService.getSellerAuctions(
      req.user.user_id,
      page,
      limit
    );

    sendPaginated(res, auctions, page, limit, total);
  } catch (error: any) {
    logger.error('Get my auctions error:', error);
    sendError(res, error.message || 'Failed to get your auctions', 500);
  }
};

/**
 * Get active auctions count
 * GET /api/v1/auctions/stats/active-count
 */
export const getActiveAuctionsCount = async (req: Request, res: Response) => {
  try {
    const count = await auctionService.getActiveAuctionsCount();
    sendSuccess(res, { count });
  } catch (error: any) {
    logger.error('Get active auctions count error:', error);
    sendError(res, error.message || 'Failed to get active auctions count', 500);
  }
};

/**
 * Get auction bids
 * GET /api/v1/auctions/:id/bids
 */
export const getAuctionBids = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const offset = (page - 1) * limit;

    const { query } = await import('../../config/database');

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) as total FROM bids WHERE auction_id = $1',
      [id]
    );
    const total = parseInt(countResult[0].total);

    // Get bids
    const bids = await query(
      `SELECT b.*,
              u.full_name as bidder_name, u.avatar_url as bidder_avatar
       FROM bids b
       JOIN users u ON b.bidder_id = u.id
       WHERE b.auction_id = $1
       ORDER BY b.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    sendPaginated(res, bids, page, limit, total);
  } catch (error: any) {
    logger.error('Get auction bids error:', error);
    sendError(res, error.message || 'Failed to get auction bids', 500);
  }
};
