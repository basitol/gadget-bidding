import { Request, Response } from 'express';
import { sendSuccess, sendError, sendPaginated } from '../../utils/response';
import * as biddingService from '../../services/bidding/bidding.service';
import * as auctionService from '../../services/auction/auction.service';
import * as orderService from '../../services/order/order.service';
import * as notificationService from '../../services/notification/notification.service';
import {
  emitToAuction,
  emitToUser,
} from '../../services/socket/socket.service';
import logger from '../../utils/logger';

/**
 * Place a bid on an auction
 * POST /api/v1/bids
 */
export const placeBid = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { auction_id, amount } = req.body;

    const { bid, previousHighBidderId } = await biddingService.placeBid(
      req.user.user_id,
      { auction_id, amount }
    );

    // Get updated auction for real-time broadcast
    const auction = await auctionService.getAuctionById(auction_id);

    // Emit socket event for real-time update to all users watching this auction
    emitToAuction(auction_id, 'bid:placed', {
      bid,
      bidder: {
        id: req.user.user_id,
        full_name: (req.user as any).full_name || 'Anonymous',
      },
      amount: amount,
      timestamp: new Date(),
      totalBids:
        (auction as any)?.bid_count || (auction as any)?.total_bids || 0,
      currentPrice: auction?.current_price || amount,
    });

    // Notify previous high bidder they've been outbid
    if (previousHighBidderId && previousHighBidderId !== req.user.user_id) {
      emitToUser(previousHighBidderId, 'bid:outbid', {
        auctionId: auction_id,
        newHighestBid: amount,
        message: `You've been outbid! New highest bid: ₦${amount.toLocaleString()}`,
      });
    }

    sendSuccess(res, bid, 'Bid placed successfully', 201);
  } catch (error: any) {
    logger.error('Place bid error:', error);
    sendError(res, error.message || 'Failed to place bid', 400);
  }
};

/**
 * Buy now - instantly win the auction
 * POST /api/v1/bids/buy-now/:auctionId
 */
export const buyNow = async (req: Request, res: Response) => {
  logger.info('Buy now controller called');
  try {
    if (!req.user) {
      logger.error('Buy now: User not authenticated');
      return sendError(res, 'User not authenticated', 401);
    }

    const { auctionId } = req.params;

    logger.info(
      `Buy now attempt: user=${req.user.user_id}, auction=${auctionId}`
    );

    const bid = await biddingService.buyNow(req.user.user_id, auctionId);

    // Create order for the buy now purchase
    let order;
    try {
      order = await orderService.createOrderFromAuction(
        auctionId,
        req.user.user_id,
        bid.amount
      );
      logger.info(`Order created for buy now: ${order.order_number}`);
    } catch (orderError: any) {
      // Log but don't fail the buy now - order can be created later
      logger.error(`Failed to create order for buy now: ${orderError.message}`);
    }

    // Emit socket event for auction ended to all watchers
    emitToAuction(auctionId, 'auction:ended', {
      auctionId,
      winnerId: req.user.user_id,
      finalPrice: bid.amount,
      buyNow: true,
      orderNumber: order?.order_number,
      timestamp: new Date(),
    });

    notificationService
      .notifyBackofficeBuyNowUsed(
        auctionId,
        bid.id,
        bid.amount,
        order?.order_number
      )
      .catch(error => {
        logger.error('Failed to notify backoffice about buy now:', error);
      });

    sendSuccess(
      res,
      {
        bid,
        order: order || null,
      },
      'Purchase successful! You won the auction.',
      200
    );
  } catch (error: any) {
    logger.error('Buy now error:', error);
    sendError(res, error.message || 'Failed to complete purchase', 400);
  }
};

/**
 * Get bid by ID
 * GET /api/v1/bids/:bidId
 */
export const getBidById = async (req: Request, res: Response) => {
  try {
    const { bidId } = req.params;

    const bid = await biddingService.getBidById(bidId);

    if (!bid) {
      return sendError(res, 'Bid not found', 404);
    }

    sendSuccess(res, bid);
  } catch (error: any) {
    logger.error('Get bid error:', error);
    sendError(res, error.message || 'Failed to get bid', 500);
  }
};

/**
 * Get bids for an auction
 * GET /api/v1/bids/auction/:auctionId
 */
export const getAuctionBids = async (req: Request, res: Response) => {
  try {
    const { auctionId } = req.params;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const { bids, total } = await biddingService.getAuctionBids(
      auctionId,
      page,
      limit
    );

    sendPaginated(res, bids, page, limit, total);
  } catch (error: any) {
    logger.error('Get auction bids error:', error);
    sendError(res, error.message || 'Failed to get auction bids', 500);
  }
};

/**
 * Get current user's bids
 * GET /api/v1/bids/my-bids
 */
export const getMyBids = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const status = req.query.status as any;

    const { bids, total } = await biddingService.getUserBids(
      req.user.user_id,
      page,
      limit,
      status
    );

    sendPaginated(res, bids, page, limit, total);
  } catch (error: any) {
    logger.error('Get my bids error:', error);
    sendError(res, error.message || 'Failed to get your bids', 500);
  }
};

/**
 * Get current user's active (winning) bids
 * GET /api/v1/bids/my-bids/active
 */
export const getMyActiveBids = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const bids = await biddingService.getUserActiveBids(req.user.user_id);

    sendSuccess(res, bids);
  } catch (error: any) {
    logger.error('Get my active bids error:', error);
    sendError(res, error.message || 'Failed to get your active bids', 500);
  }
};

/**
 * Get highest bid for an auction
 * GET /api/v1/bids/auction/:auctionId/highest
 */
export const getHighestBid = async (req: Request, res: Response) => {
  try {
    const { auctionId } = req.params;

    const bid = await biddingService.getHighestBid(auctionId);

    if (!bid) {
      return sendSuccess(res, null, 'No bids yet');
    }

    sendSuccess(res, bid);
  } catch (error: any) {
    logger.error('Get highest bid error:', error);
    sendError(res, error.message || 'Failed to get highest bid', 500);
  }
};
