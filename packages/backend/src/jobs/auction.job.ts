import * as biddingService from '../services/bidding/bidding.service';
import * as socketService from '../services/socket/socket.service';
import * as orderService from '../services/order/order.service';
import * as notificationService from '../services/notification/notification.service';
import { query } from '../config/database';
import logger from '../utils/logger';
import * as savedSearchService from '../services/buyer/savedSearch.service';
import * as storeService from '../services/buyer/store.service';
import * as buyerAlerts from '../services/notification/buyerAlerts';
import { isMaintenanceActive } from '../services/app/appConfig.service';
import { liftExpiredRestrictions } from '../services/admin/people.service';
import * as payoutsService from '../services/seller/payouts.service';

let auctionJobInterval: NodeJS.Timeout | null = null;

/**
 * Process expired auctions
 */
const processExpiredAuctions = async (): Promise<void> => {
  try {
    // Maintenance: nothing ends. Ending maintenance adds the paused time back to these auctions.
    if (await isMaintenanceActive()) return;
    const expiredAuctions = await biddingService.getExpiredAuctions();

    for (const auction of expiredAuctions) {
      try {
        // Maintenance started mid-run: leave the rest for when it ends.
        if (await isMaintenanceActive()) return;
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
              await import('../services/seller/sellerAlerts').then(a => a.notifySellerAuctionEnded(auction.id, true));
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
        } else {
          // Notify seller auction ended without winner
          if (sellerId) {
            await import('../services/seller/sellerAlerts').then(a => a.notifySellerAuctionEnded(auction.id, false));
          }
          // Bidders and watchers: nobody won, nothing was charged.
          const people = await query(
            `SELECT bidder_id AS user_id FROM bids WHERE auction_id = $1 AND bidder_id IS NOT NULL
             UNION SELECT user_id FROM watchlist WHERE auction_id = $1`,
            [auction.id]
          );
          const reason = result.winnerId && !result.reserveMet ? 'reserve' : 'no_bids';
          for (const p of people) {
            if (p.user_id === sellerId) continue;
            await notificationService
              .notifyAuctionNoSale(p.user_id, auction.id, gadgetTitle, reason)
              .catch(err => logger.error('No-sale notification failed:', err));
          }
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
    // Maintenance: scheduled auctions wait; they start (with their lost time added) once it ends.
    if (await isMaintenanceActive()) return;
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
 * "Ending soon" alerts go to bidders and watchers twice: an hour before the end and
 * 15 minutes before (Notification settings › Watchlist ending soon). Each fires once.
 */
const ENDING_SOON_REMINDERS = [
  { key: '15m', minutes: 15 },
  { key: '1h', minutes: 60 },
] as const;
/** Open screens get a live "ending soon" signal over the socket in the last few minutes. */
const ENDING_SOON_BROADCAST_MINUTES = 5;

const notifyAuctionsEndingSoon = async (): Promise<void> => {
  try {
    // Maintenance: end times are about to move, so "ending soon" would be wrong.
    if (await isMaintenanceActive()) return;
    const auctionsEndingSoon = await biddingService.getAuctionsEndingSoon(
      ENDING_SOON_REMINDERS[ENDING_SOON_REMINDERS.length - 1].minutes
    );

    for (const auction of auctionsEndingSoon) {
      const minutesRemaining = Math.ceil(
        (new Date(auction.end_time).getTime() - Date.now()) / (60 * 1000)
      );

      if (minutesRemaining <= ENDING_SOON_BROADCAST_MINUTES) {
        socketService.broadcastAuctionEndingSoon(auction.id, minutesRemaining);
      }

      // The closest reminder that applies now (15m wins over 1h once we're inside 15 minutes).
      const reminder = ENDING_SOON_REMINDERS.find(r => minutesRemaining <= r.minutes)!.key;

      // Bidders and watchers get each reminder once per auction (this runs every 30s).
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
            auction.id,
            reminder
          )
        ) {
          continue;
        }
        await notificationService.notifyAuctionEndingSoon(
          row.bidder_id,
          auction.id,
          row.title || 'an item',
          Math.max(1, minutesRemaining),
          row.watching === true,
          reminder
        );
      }
    }
  } catch (error) {
    logger.error('Error notifying auctions ending soon:', error);
  }
};

/**
 * Remind winners to pay when this many hours are left on the payment window
 * (Notification settings › Payment reminders: 12h and 2h before the deadline).
 * Override with PAYMENT_REMINDER_HOURS_LEFT, e.g. "12,2".
 */
const PAYMENT_REMINDER_HOURS = String(process.env.PAYMENT_REMINDER_HOURS_LEFT || '12,2')
  .split(',')
  .map(h => Number(h.trim()))
  .filter(h => Number.isFinite(h) && h > 0)
  .sort((a, b) => a - b);

/**
 * Remind winners who haven't paid yet, once per reminder, before their order expires.
 */
const remindUnpaidOrders = async (): Promise<void> => {
  try {
    const windowHours = orderService.ORDER_PAYMENT_EXPIRY_HOURS;
    // Due time: payment_due_at when set (accepted second-chance offers), else created_at + window.
    const rows = await query(
      `SELECT o.id, o.order_number, o.buyer_id, o.total_amount, g.title,
              COALESCE(o.payment_due_at, o.created_at + make_interval(secs => $2)) AS due_at
       FROM orders o
       LEFT JOIN auctions a ON a.id = o.auction_id
       LEFT JOIN gadgets g ON g.id = a.gadget_id
       WHERE o.payment_status = 'pending'
         AND o.fulfillment_status = 'pending'
         AND o.offer_expires_at IS NULL
         AND COALESCE(o.payment_due_at, o.created_at + make_interval(secs => $2)) > NOW()
         AND COALESCE(o.payment_due_at, o.created_at + make_interval(secs => $2)) <= NOW() + make_interval(secs => $1)
       LIMIT 100`,
      [Math.max(...PAYMENT_REMINDER_HOURS) * 3600, windowHours * 3600]
    );
    for (const o of rows) {
      const hoursLeft = (new Date(o.due_at).getTime() - Date.now()) / 3_600_000;
      const due = PAYMENT_REMINDER_HOURS.find(h => hoursLeft <= h);
      if (!due) continue;
      const reminder = `${due}h`;
      if (await notificationService.alreadyNotified(o.buyer_id, 'payment_reminder', 'orderId', o.id, reminder)) {
        continue;
      }
      await notificationService.notifyPaymentReminder(
        o.buyer_id,
        o.id,
        o.order_number,
        o.title || 'your win',
        Number(o.total_amount),
        hoursLeft,
        reminder
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
 * Seller payouts at 6:00 pm Lagos: one per seller for the orders ready by then. Runs every tick;
 * only does something once a run is due (and catches up if the server was down at 6 pm).
 */
const runSellerPayouts = async (): Promise<void> => {
  try {
    const result = await payoutsService.runDuePayouts();
    if (result?.created.length) {
      // Sellers whose payout account changed recently are skipped (skipped.paused); their orders stay ready.
      const paused = result.skipped.paused ? `, ${result.skipped.paused} paused after an account change` : '';
      logger.info(`Seller payouts for ${result.slot}: ${result.created.length} made, ${result.sent} sent to Paystack${paused}`);
    }
  } catch (error) {
    logger.error('Seller payout run failed:', error);
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
    await orderService.expireSecondChanceOffers().catch(err => logger.error('Second-chance expiry failed:', err));
    await orderService.autoConfirmDeliveries().catch(err => logger.error('Auto-confirm deliveries failed:', err));
    await notifySavedSearchMatches();
    await storeService.notifyFollowersOfNewListings().catch(err => logger.error('Store follower alerts failed:', err));
    await buyerAlerts.remindConfirmDelivery().catch(err => logger.error('Confirm-delivery reminders failed:', err));
    await runSellerPayouts();
    // Suspensions and listing pauses that ran their 7 or 30 days end by themselves.
    await liftExpiredRestrictions().catch(err => logger.error('Lifting expired restrictions failed:', err));
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
