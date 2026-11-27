import * as biddingService from '../services/bidding/bidding.service';
import * as socketService from '../services/socket/socket.service';
import * as orderService from '../services/order/order.service';
import * as notificationService from '../services/notification/notification.service';
import { query } from '../config/database';
import logger from '../utils/logger';
import * as savedSearchService from '../services/buyer/savedSearch.service';
import * as storeService from '../services/buyer/store.service';
import * as buyerAlerts from '../services/notification/buyerAlerts';

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
              order.order_number,
              (order as any).id
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

      // Bidders and watchers get one "ending soon" alert per auction (this runs every 30s).
      const rows = await query(
        `SELECT p.user_id AS bidder_id, g.title, bool_and(p.watching) AS watching
         FROM (
           SELECT bidder_id AS user_id, false AS watching FROM bids WHERE auction_id = $1
           UNION
           SELECT user_id, true AS watching FROM watchlist WHERE auction_id = $1
         ) p
         JOIN auctions a ON a.id = $1
         JOIN gadgets g ON g.id = a.gadget_id
         WHERE p.user_id IS NOT NULL
         GROUP BY p.user_id, g.title`,
        [auction.id]
      );
      for (const row of rows) {
        if (
          await notificationService.alreadyNotified(
            row.bidder_id,
            'auction_ending_soon',
            'auctionId',
            auction.id
          )
        ) {
          continue;
        }
        await notificationService.notifyAuctionEndingSoon(
          row.bidder_id,
          auction.id,
          row.title || 'an item',
          Math.max(1, minutesRemaining),
          row.watching === true
        );
      }
    }
  } catch (error) {
    logger.error('Error notifying auctions ending soon:', error);
  }
};

/** Remind winners to pay when this many hours are left on the payment window. */
const PAYMENT_REMINDER_HOURS_LEFT = Number(process.env.PAYMENT_REMINDER_HOURS_LEFT || 6);

/**
 * Remind winners who haven't paid yet, once, before their order expires.
 */
const remindUnpaidOrders = async (): Promise<void> => {
  try {
    const windowHours = orderService.ORDER_PAYMENT_EXPIRY_HOURS;
    const rows = await query(
      `SELECT o.id, o.order_number, o.buyer_id, o.total_amount, o.created_at, g.title
       FROM orders o
       LEFT JOIN auctions a ON a.id = o.auction_id
       LEFT JOIN gadgets g ON g.id = a.gadget_id
       WHERE o.payment_status = 'pending'
         AND o.fulfillment_status = 'pending'
         AND o.created_at <= NOW() - make_interval(secs => $1)
         AND o.created_at > NOW() - make_interval(secs => $2)
       LIMIT 100`,
      [
        Math.max(0, windowHours - PAYMENT_REMINDER_HOURS_LEFT) * 3600,
        windowHours * 3600,
      ]
    );
    for (const o of rows) {
      if (await notificationService.alreadyNotified(o.buyer_id, 'payment_reminder', 'orderId', o.id)) {
        continue;
      }
      const hoursLeft =
        windowHours - (Date.now() - new Date(o.created_at).getTime()) / 3_600_000;
      await notificationService.notifyPaymentReminder(
        o.buyer_id,
        o.id,
        o.order_number,
        o.title || 'your win',
        Number(o.total_amount),
        hoursLeft
      );
    }
  } catch (error) {
    logger.error('Error sending payment reminders:', error);
  }
};

/**
 * Saved searches: tell people when a matching auction goes live (once per auction).
 */
const notifySavedSearchMatches = async (): Promise<void> => {
  try {
    await savedSearchService.notifyNewMatches();
  } catch (error) {
    logger.error('Error matching saved searches:', error);
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
    await remindUnpaidOrders();
    await notifySavedSearchMatches();
    await storeService.notifyFollowersOfNewListings().catch(err => logger.error('Store follower alerts failed:', err));
    await buyerAlerts.remindConfirmDelivery().catch(err => logger.error('Confirm-delivery reminders failed:', err));
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
