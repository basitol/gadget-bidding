import { query } from '../../config/database';
import {
  Notification,
  NotificationType,
  NotificationChannel,
} from '@gadget-bidding/shared';
import * as smsService from './sms.service';
import * as pushService from './push.service';
import * as socketService from '../socket/socket.service';
import logger from '../../utils/logger';

/** Shown with iOS "time-sensitive" priority: they matter within minutes. */
const URGENT_TYPES = new Set<NotificationType>([
  'outbid',
  'auction_ending_soon',
  'auction_won',
  'payment_reminder',
]);

/* ---------------- Alert preferences (Settings screen) ---------------- */

export interface NotificationPrefs {
  bids: boolean;
  orders: boolean;
  marketing: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = { bids: true, orders: true, marketing: false };

/** Which Settings switch controls each type. Types not listed (account, support, admin) always send. */
const PREF_FOR_TYPE: Partial<Record<NotificationType, keyof NotificationPrefs>> = {
  bid_placed: 'bids',
  outbid: 'bids',
  auction_won: 'bids',
  auction_lost: 'bids',
  auction_ending_soon: 'bids',
  bid_defaulted: 'bids',
  order_created: 'orders',
  order_shipped: 'orders',
  order_delivered: 'orders',
  payment_initiated: 'orders',
  payment_received: 'orders',
  payment_failed: 'orders',
  payment_reminder: 'orders',
};

export const getPreferences = async (userId: string): Promise<NotificationPrefs> => {
  const rows = await query('SELECT notification_prefs FROM users WHERE id = $1', [userId]);
  return { ...DEFAULT_PREFS, ...(rows[0]?.notification_prefs || {}) };
};

export const updatePreferences = async (
  userId: string,
  changes: Partial<NotificationPrefs>
): Promise<NotificationPrefs> => {
  const clean: Partial<NotificationPrefs> = {};
  for (const key of Object.keys(DEFAULT_PREFS) as (keyof NotificationPrefs)[]) {
    if (typeof changes[key] === 'boolean') clean[key] = changes[key];
  }
  const next = { ...(await getPreferences(userId)), ...clean };
  await query('UPDATE users SET notification_prefs = $2, updated_at = NOW() WHERE id = $1', [
    userId,
    JSON.stringify(next),
  ]);
  return next;
};

/**
 * Create and send notification
 */
export const createNotification = async (
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  data?: Record<string, any>,
  channels: NotificationChannel[] = ['push']
): Promise<Notification> => {
  // Create notification record
  const result = await query(
    `INSERT INTO notifications
     (user_id, notification_type, title, message, data, channels, is_read, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
     RETURNING *`,
    [userId, type, title, message, JSON.stringify(data || {}), channels]
  );

  const notification = result[0];

  // The in-app list always gets it; push and SMS respect the user's Settings switches.
  const pref = PREF_FOR_TYPE[type];
  const muted = pref ? !(await getPreferences(userId).catch(() => DEFAULT_PREFS))[pref] : false;

  // Send via appropriate channels
  for (const channel of channels) {
    if (muted && channel !== 'push') continue;
    try {
      switch (channel) {
        case 'push':
          // Send via Socket.io for real-time
          socketService.emitToUser(userId, 'notification', {
            id: notification.id,
            type,
            title,
            message,
            data,
            timestamp: new Date(),
          });
          // And to the phone itself, so it arrives with the app closed.
          // Not awaited: a slow push service must never hold up a bid or an order.
          if (muted) break;
          void pushService.sendToUser(userId, {
            title,
            body: message,
            data: { ...(data || {}), type, notificationId: notification.id },
            urgent: URGENT_TYPES.has(type),
          });
          break;

        case 'sms':
          // Get user phone number
          const userResult = await query(
            'SELECT phone_number FROM users WHERE id = $1',
            [userId]
          );
          // Email/social sign-ups get a placeholder +9… number; never text it.
          if (userResult.length > 0 && !String(userResult[0].phone_number).startsWith('+9')) {
            await smsService.sendSMS({
              to: userResult[0].phone_number,
              message,
            });
          }
          break;

        case 'email':
          // TODO: Implement email notifications
          logger.info(`Email notification queued for user ${userId}: ${title}`);
          break;
      }
    } catch (error) {
      logger.error(`Failed to send ${channel} notification:`, error);
    }
  }

  logger.info(`Notification created: ${type} for user ${userId}`);

  return notification;
};

/**
 * Get user's notifications
 */
export const getUserNotifications = async (
  userId: string,
  page: number = 1,
  limit: number = 20,
  unreadOnly: boolean = false
): Promise<{
  notifications: Notification[];
  total: number;
  unreadCount: number;
}> => {
  const offset = (page - 1) * limit;

  let whereClause =
    "WHERE user_id = $1 AND notification_type != 'bid_placed_admin'";
  if (unreadOnly) {
    whereClause += ' AND is_read = false';
  }

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as total FROM notifications ${whereClause}`,
    [userId]
  );
  const total = parseInt(countResult[0].total);

  // Get unread count
  const unreadResult = await query(
    `SELECT COUNT(*) as unread FROM notifications
     WHERE user_id = $1
       AND is_read = false
       AND notification_type != 'bid_placed_admin'`,
    [userId]
  );
  const unreadCount = parseInt(unreadResult[0].unread);

  // Get notifications
  const notifications = await query(
    `SELECT * FROM notifications
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return { notifications, total, unreadCount };
};

/**
 * Mark notification as read
 */
export const markAsRead = async (
  notificationId: string,
  userId: string
): Promise<Notification | null> => {
  const result = await query(
    `UPDATE notifications
     SET is_read = true
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [notificationId, userId]
  );

  return result.length > 0 ? result[0] : null;
};

/**
 * Mark all notifications as read
 */
export const markAllAsRead = async (userId: string): Promise<number> => {
  const result = await query(
    `UPDATE notifications
     SET is_read = true
     WHERE user_id = $1 AND is_read = false
     RETURNING id`,
    [userId]
  );

  return result.length;
};

/**
 * Delete notification
 */
export const deleteNotification = async (
  notificationId: string,
  userId: string
): Promise<boolean> => {
  const result = await query(
    'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
    [notificationId, userId]
  );

  return result.length > 0;
};

/**
 * Notify all active admins.
 */
export const notifyAdmins = async (
  type: NotificationType,
  title: string,
  message: string,
  data?: Record<string, any>
): Promise<void> => {
  const admins = await query(
    `SELECT id FROM users
     WHERE role = 'admin' AND is_active = true`
  );

  await Promise.all(
    admins.map(admin =>
      createNotification(admin.id, type, title, message, data, ['push'])
    )
  );
};

// ============================================================================
// Notification Templates
// ============================================================================

/**
 * Notify backoffice that seller sent/dropped an item to operations.
 */
export const notifyBackofficeIntake = async (
  orderId: string,
  orderNumber: string
): Promise<void> => {
  await notifyAdmins(
    'backoffice_intake',
    'Item sent to backoffice',
    `Order #${orderNumber} is ready for backoffice receiving.`,
    { orderId, orderNumber, route: '/backoffice' }
  );
};

/**
 * Notify backoffice that a seller created an auction.
 */
export const notifyBackofficeAuctionCreated = async (
  auctionId: string,
  gadgetTitle: string
): Promise<void> => {
  await notifyAdmins(
    'auction_created',
    'New auction created',
    `"${gadgetTitle}" was listed for auction by a seller.`,
    { auctionId, route: '/auctions' }
  );
};

/**
 * Notify backoffice that a seller submitted a gadget for review.
 */
export const notifyBackofficeGadgetSubmitted = async (
  gadgetId: string,
  gadgetTitle: string
): Promise<void> => {
  await notifyAdmins(
    'gadget_submitted',
    'New gadget submitted',
    `"${gadgetTitle}" is waiting for admin review.`,
    { gadgetId, route: '/gadgets' }
  );
};

/**
 * Notify a seller that their approved listing has gone live as an auction.
 */
export const notifySellerListingLive = async (
  sellerId: string,
  gadgetTitle: string
): Promise<void> => {
  await createNotification(
    sellerId,
    'auction_created',
    `Your listing is live: ${gadgetTitle}`,
    `"${gadgetTitle}" has been approved and is now live for bidding.`,
    {},
    ['push', 'sms']
  );
};

/**
 * Notify a seller that their listing was rejected.
 */
export const notifySellerListingRejected = async (
  sellerId: string,
  gadgetTitle: string,
  reason: string
): Promise<void> => {
  await createNotification(
    sellerId,
    'system',
    'Listing not approved',
    `"${gadgetTitle}" was rejected: ${reason}`,
    {},
    ['push', 'sms']
  );
};

/**
 * Notify backoffice that a buyer used buy now.
 */
export const notifyBackofficeBuyNowUsed = async (
  auctionId: string,
  bidId: string,
  amount: number,
  orderNumber?: string
): Promise<void> => {
  await notifyAdmins(
    'buy_now_used',
    'Buy now used',
    `A buyer used buy now for ₦${amount.toLocaleString()}${orderNumber ? ` on order #${orderNumber}` : ''}.`,
    { auctionId, bidId, orderNumber, amount, route: '/orders' }
  );
};

/**
 * Notify backoffice that an order payment was completed.
 */
export const notifyBackofficeOrderPaid = async (
  orderId: string,
  orderNumber: string,
  amount: number
): Promise<void> => {
  await notifyAdmins(
    'order_paid_admin',
    'Order payment completed',
    `Order #${orderNumber} was paid for ₦${amount.toLocaleString()}.`,
    { orderId, orderNumber, amount, route: '/orders' }
  );
};

/**
 * Notify backoffice about seller fulfillment updates.
 */
export const notifyBackofficeFulfillmentUpdated = async (
  orderId: string,
  orderNumber: string,
  statusLabel: string
): Promise<void> => {
  await notifyAdmins(
    'fulfillment_updated',
    'Seller updated fulfillment',
    `Order #${orderNumber} is now ${statusLabel}.`,
    { orderId, orderNumber, status: statusLabel, route: '/backoffice' }
  );
};

/**
 * Notify backoffice that a buyer confirmed delivery.
 */
export const notifyBackofficeDeliveryConfirmed = async (
  orderId: string,
  orderNumber: string
): Promise<void> => {
  await notifyAdmins(
    'delivery_confirmed_admin',
    'Delivery confirmed',
    `Buyer confirmed delivery for order #${orderNumber}.`,
    { orderId, orderNumber, route: '/backoffice' }
  );
};

/**
 * Notify backoffice that a dispute was opened.
 */
export const notifyBackofficeDisputeOpened = async (
  orderId: string,
  orderNumber: string,
  disputeId: string,
  disputeLabel: string
): Promise<void> => {
  await notifyAdmins(
    'dispute_opened',
    'New dispute opened',
    `A ${disputeLabel} dispute was opened for order #${orderNumber}.`,
    {
      orderId,
      orderNumber,
      disputeId,
      disputeType: disputeLabel,
      route: '/orders',
    }
  );
};

/**
 * Notify backoffice that a seller sent a support message.
 */
export const notifyBackofficeSupportMessage = async (
  threadId: string,
  sellerName: string,
  messagePreview: string
): Promise<void> => {
  await notifyAdmins(
    'support_message',
    'New support message',
    `${sellerName} sent a message: ${messagePreview}`,
    { threadId, route: '/support' }
  );
};

/**
 * Notify user they've been outbid
 */
export const notifyOutbid = async (
  userId: string,
  auctionId: string,
  gadgetTitle: string,
  newHighestBid: number
): Promise<void> => {
  await createNotification(
    userId,
    'outbid',
    `Outbid on ${gadgetTitle}`,
    `The highest bid is now ₦${newHighestBid.toLocaleString()}. Place a new bid if you still want this item.`,
    { auctionId, newHighestBid },
    ['push', 'sms']
  );
};

/**
 * Notify user they won an auction
 */
export const notifyAuctionWon = async (
  userId: string,
  auctionId: string,
  gadgetTitle: string,
  finalPrice: number,
  orderNumber: string,
  orderId?: string
): Promise<void> => {
  await createNotification(
    userId,
    'auction_won',
    `You won ${gadgetTitle}`,
    `You won "${gadgetTitle}" for ₦${finalPrice.toLocaleString()}. Order #${orderNumber} has been created — complete payment and provide shipping details.`,
    // orderId first: tapping the alert should open the order to pay, not the closed auction.
    { orderId, auctionId, finalPrice, orderNumber },
    ['push', 'sms']
  );
};

/**
 * Notify user they lost an auction
 */
export const notifyAuctionLost = async (
  userId: string,
  auctionId: string,
  gadgetTitle: string
): Promise<void> => {
  await createNotification(
    userId,
    'auction_lost',
    'Auction ended',
    `The auction for "${gadgetTitle}" has ended and you didn't win. Your held bid funds have been released.`,
    { auctionId },
    ['push']
  );
};

/**
 * Notify seller of auction end
 */
export const notifySellerAuctionEnded = async (
  sellerId: string,
  auctionId: string,
  gadgetTitle: string,
  finalPrice: number,
  winnerId: string | null,
  orderNumber?: string
): Promise<void> => {
  if (winnerId && orderNumber) {
    await createNotification(
      sellerId,
      'auction_won',
      `Your auction sold: ${gadgetTitle}`,
      `Your "${gadgetTitle}" sold for ₦${finalPrice.toLocaleString()}. Order #${orderNumber} has been created. Please prepare the item for shipping.`,
      { auctionId, finalPrice, orderNumber },
      ['push', 'sms']
    );
  } else {
    await createNotification(
      sellerId,
      'auction_lost',
      'Your auction has ended',
      `Your auction for "${gadgetTitle}" ended without any bids. You can relist the item.`,
      { auctionId },
      ['push']
    );
  }
};

/**
 * Notify about auction ending soon
 */
export const notifyAuctionEndingSoon = async (
  userId: string,
  auctionId: string,
  gadgetTitle: string,
  minutesRemaining: number,
  watching = false
): Promise<void> => {
  await createNotification(
    userId,
    'auction_ending_soon',
    watching ? 'Ending soon on your watchlist' : 'Ending soon',
    `${gadgetTitle} ends in ${minutesRemaining} minute${minutesRemaining === 1 ? '' : 's'}.`,
    { auctionId, minutesRemaining },
    ['push']
  );
};

/**
 * Notify about payment received
 */
export const notifyPaymentReceived = async (
  sellerId: string,
  orderNumber: string,
  amount: number
): Promise<void> => {
  await createNotification(
    sellerId,
    'payment_received',
    'Payment received',
    `Payment of ₦${amount.toLocaleString()} received for order #${orderNumber}. Please ship the item.`,
    { orderNumber, amount },
    ['push', 'sms']
  );
};

/**
 * Notify about order shipped
 */
export const notifyOrderShipped = async (
  buyerId: string,
  orderNumber: string,
  trackingNumber?: string
): Promise<void> => {
  const message = trackingNumber
    ? `Your order #${orderNumber} has been shipped. Tracking number: ${trackingNumber}`
    : `Your order #${orderNumber} has been shipped.`;

  await createNotification(
    buyerId,
    'order_shipped',
    `Order shipped: #${orderNumber}`,
    message,
    { orderNumber, trackingNumber },
    ['push', 'sms']
  );
};

/**
 * Notify about order delivered
 */
export const notifyOrderDelivered = async (
  sellerId: string,
  orderNumber: string,
  payoutAmount: number
): Promise<void> => {
  await createNotification(
    sellerId,
    'order_delivered',
    `Order delivered: #${orderNumber}`,
    `Order #${orderNumber} has been delivered. ₦${payoutAmount.toLocaleString()} has been credited to your wallet.`,
    { orderNumber, payoutAmount },
    ['push', 'sms']
  );
};

/**
 * Notify buyer about order created (after winning auction or buy now)
 */
export const notifyOrderCreated = async (
  buyerId: string,
  orderId: string,
  orderNumber: string,
  gadgetTitle: string,
  amount: number
): Promise<void> => {
  await createNotification(
    buyerId,
    'order_created',
    'Order Created - Payment Required',
    `Your order #${orderNumber} for "${gadgetTitle}" has been created. Total: ₦${amount.toLocaleString()}. Please complete payment to proceed.`,
    { orderId, orderNumber, gadgetTitle, amount },
    ['push', 'sms']
  );
};

/**
 * Notify about payment initiated
 */
export const notifyPaymentInitiated = async (
  userId: string,
  orderNumber: string,
  amount: number
): Promise<void> => {
  await createNotification(
    userId,
    'payment_initiated',
    'Payment Started',
    `Payment of ₦${amount.toLocaleString()} initiated for order #${orderNumber}. Please complete the payment.`,
    { orderNumber, amount },
    ['push']
  );
};

/**
 * Notify about payment failed
 */
export const notifyPaymentFailed = async (
  userId: string,
  orderNumber: string,
  amount: number,
  reason?: string
): Promise<void> => {
  await createNotification(
    userId,
    'payment_failed',
    'Payment Failed',
    `Payment of ₦${amount.toLocaleString()} for order #${orderNumber} failed. ${reason || 'Please try again.'}`,
    { orderNumber, amount, reason },
    ['push', 'sms']
  );
};

/**
 * Outbid, looked up by auction (callers only know the auction id and the new amount).
 */
export const notifyOutbidForAuction = async (
  userId: string,
  auctionId: string,
  newHighestBid: number
): Promise<void> => {
  const rows = await query(
    `SELECT g.title, a.end_time, a.bid_increment FROM auctions a JOIN gadgets g ON g.id = a.gadget_id WHERE a.id = $1`,
    [auctionId]
  );
  const title = rows[0]?.title || 'an item';
  const nextBid = newHighestBid + Number(rows[0]?.bid_increment || 100);
  const msLeft = rows[0]?.end_time ? new Date(rows[0].end_time).getTime() - Date.now() : 0;
  const mins = Math.max(1, Math.round(msLeft / 60000));
  const left = mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`;
  await createNotification(
    userId,
    'outbid',
    "You've been outbid",
    `${title} · current bid is now ₦${newHighestBid.toLocaleString()}. Ends in ${left}.`,
    { auctionId, newHighestBid, nextBid },
    ['push', 'sms']
  );
};

/** True if this user already got a notification of this type about this auction/order. */
export const alreadyNotified = async (
  userId: string,
  type: NotificationType,
  key: 'auctionId' | 'orderId',
  value: string
): Promise<boolean> => {
  const rows = await query(
    `SELECT 1 FROM notifications
     WHERE user_id = $1 AND notification_type = $2 AND data->>'${key}' = $3
     LIMIT 1`,
    [userId, type, value]
  );
  return rows.length > 0;
};

/**
 * Remind a winner to pay before the order expires.
 */
export const notifyPaymentReminder = async (
  userId: string,
  orderId: string,
  orderNumber: string,
  gadgetTitle: string,
  amount: number,
  hoursLeft: number
): Promise<void> => {
  const left = hoursLeft <= 1 ? 'less than an hour' : `about ${Math.round(hoursLeft)} hours`;
  await createNotification(
    userId,
    'payment_reminder',
    `Time to pay for ${gadgetTitle}`,
    `You have ${left} to pay ₦${amount.toLocaleString()} for order #${orderNumber}, or it goes to the next bidder.`,
    { orderId, orderNumber },
    ['push']
  );
};
