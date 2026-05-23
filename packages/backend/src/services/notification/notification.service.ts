import { query } from '../../config/database';
import {
  Notification,
  NotificationType,
  NotificationChannel,
} from '@gadget-bidding/shared';
import * as smsService from './sms.service';
import * as socketService from '../socket/socket.service';
import logger from '../../utils/logger';

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

  // Send via appropriate channels
  for (const channel of channels) {
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
          break;

        case 'sms':
          // Get user phone number
          const userResult = await query(
            'SELECT phone_number FROM users WHERE id = $1',
            [userId]
          );
          if (userResult.length > 0) {
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

  let whereClause = 'WHERE user_id = $1';
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
    'SELECT COUNT(*) as unread FROM notifications WHERE user_id = $1 AND is_read = false',
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

// ============================================================================
// Notification Templates
// ============================================================================

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
    "You've been outbid!",
    `Someone placed a higher bid of ₦${newHighestBid.toLocaleString()} on "${gadgetTitle}". Place a higher bid to stay in the lead!`,
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
  orderNumber: string
): Promise<void> => {
  await createNotification(
    userId,
    'auction_won',
    'Congratulations! You won the auction!',
    `You won "${gadgetTitle}" for ₦${finalPrice.toLocaleString()}. Order #${orderNumber} has been created. Please confirm payment and provide shipping details.`,
    { auctionId, finalPrice, orderNumber },
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
    `The auction for "${gadgetTitle}" has ended. Unfortunately, you didn't win this time. Check out other auctions!`,
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
      'Your auction has ended!',
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
  minutesRemaining: number
): Promise<void> => {
  await createNotification(
    userId,
    'auction_ending_soon',
    'Auction ending soon!',
    `The auction for "${gadgetTitle}" ends in ${minutesRemaining} minutes. Don't miss your chance!`,
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
    'Payment received!',
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
    ? `Your order #${orderNumber} has been shipped! Tracking number: ${trackingNumber}`
    : `Your order #${orderNumber} has been shipped!`;

  await createNotification(
    buyerId,
    'order_shipped',
    'Order shipped!',
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
    'Order delivered!',
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
