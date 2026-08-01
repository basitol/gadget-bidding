import * as biddingService from '../services/bidding/bidding.service';
import * as socketService from '../services/socket/socket.service';
import * as orderService from '../services/order/order.service';
import * as notificationService from '../services/notification/notification.service';
import { query } from '../config/database';
import logger from '../utils/logger';

let auctionJobInterval: NodeJS.Timeout | null = null;

/**
 * Process expired auctions
 */
const processExpiredAuctions = async (): Promise<void> => {
  try {
    const expiredAuctions = await biddingService.getExpiredAuctions();

    for (const auction of expiredAuctions) {
      try {
        const result = await biddingService.endAuction(auction.id);

        // Broadcast auction ended via socket
        socketService.broadcastAuctionEnded(
          auction.id,
          result.winnerId,
          result.finalPrice
        );

        // Get gadget title for notifications
        const gadgetResult = await query(
          `SELECT g.title, g.seller_id FROM gadgets g
           JOIN auctions a ON g.id = a.gadget_id
           WHERE a.id = $1`,
          [auction.id]
        );
        const gadgetTitle = gadgetResult[0]?.title || 'Item';
        const sellerId = gadgetResult[0]?.seller_id;

        if (result.winnerId && result.finalPrice && result.reserveMet) {
          // Create order for winner
          try {
            const order = await orderService.createOrderFromAuction(
              auction.id,
              result.winnerId,
              result.finalPrice
            );

            // Notify winner
            await notificationService.notifyAuctionWon(
              result.winnerId,
              auction.id,
              gadgetTitle,
              result.finalPrice,
              order.order_number
            );

            // Notify seller
            if (sellerId) {
              await notificationService.notifySellerAuctionEnded(
                sellerId,
                auction.id,
                gadgetTitle,
                result.finalPrice,
                result.winnerId,
                order.order_number
              );
            }

            // Notify other bidders they lost
            const otherBidders = await query(
              `SELECT DISTINCT bidder_id FROM bids
               WHERE auction_id = $1 AND bidder_id != $2`,
              [auction.id, result.winnerId]
            );

            for (const bidder of otherBidders) {
              await notificationService.notifyAuctionLost(
                bidder.bidder_id,
                auction.id,
                gadgetTitle
              );
            }

            logger.info(
              `Order ${order.order_number} created for auction ${auction.id}`
            );
          } catch (orderError) {
            logger.error(
              `Failed to create order for auction ${auction.id}:`,
              orderError
            );
          }
        } else if (sellerId) {
          // Notify seller auction ended without winner
          await notificationService.notifySellerAuctionEnded(
            sellerId,
            auction.id,
            gadgetTitle,
            0,
            null
          );
        }

        logger.info(`Processed expired auction: ${auction.id}`);
      } catch (error) {
        logger.error(`Failed to process auction ${auction.id}:`, error);
      }
    }
  } catch (error) {
    logger.error('Error processing expired auctions:', error);
  }
};

/**
 * Activate scheduled auctions
 */
const activateScheduledAuctions = async (): Promise<void> => {
  try {
    const count = await biddingService.activateScheduledAuctions();
    if (count > 0) {
      logger.info(`Activated ${count} scheduled auctions`);
    }
  } catch (error) {
    logger.error('Error activating scheduled auctions:', error);
  }
};

/**
 * Expire unpaid orders that missed the payment window
 */
const expirePendingOrders = async (): Promise<void> => {
  try {
    const count = await orderService.expirePendingOrders();
    if (count > 0) {
      logger.info(`Expired ${count} unpaid pending orders`);
    }
  } catch (error) {
    logger.error('Error expiring pending orders:', error);
  }
};

/**
 * Notify users about auctions ending soon
 */
const notifyAuctionsEndingSoon = async (): Promise<void> => {
  try {
    // Get auctions ending in 5 minutes
    const auctionsEndingSoon = await biddingService.getAuctionsEndingSoon(5);

    for (const auction of auctionsEndingSoon) {
      const minutesRemaining = Math.ceil(
        (new Date(auction.end_time).getTime() - Date.now()) / (60 * 1000)
      );

      socketService.broadcastAuctionEndingSoon(auction.id, minutesRemaining);
    }
  } catch (error) {
    logger.error('Error notifying auctions ending soon:', error);
  }
};

/**
 * Start auction processing job
 * Runs every 30 seconds
 */
export const startAuctionJob = (): void => {
  if (auctionJobInterval) {
    logger.warn('Auction job already running');
    return;
  }

  logger.info('Starting auction processing job...');

  // Run immediately on start
  processExpiredAuctions();
  activateScheduledAuctions();
  expirePendingOrders();

  // Then run every 30 seconds
  auctionJobInterval = setInterval(async () => {
    await processExpiredAuctions();
    await activateScheduledAuctions();
    await expirePendingOrders();
    await notifyAuctionsEndingSoon();
  }, 30000); // 30 seconds

  logger.info('Auction processing job started');
};

/**
 * Stop auction processing job
 */
export const stopAuctionJob = (): void => {
  if (auctionJobInterval) {
    clearInterval(auctionJobInterval);
    auctionJobInterval = null;
    logger.info('Auction processing job stopped');
  }
};

/**
 * Manually trigger auction processing (for testing)
 */
export const triggerAuctionProcessing = async (): Promise<void> => {
  await processExpiredAuctions();
  await activateScheduledAuctions();
  await expirePendingOrders();
};
