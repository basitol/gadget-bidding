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

/* ---------------- Alert preferences (Profile › Notifications) ---------------- */

/** One switch per row on the Notifications screen. */
export interface AlertSwitches {
  outbid: boolean;
  ending_soon: boolean;
  autobid_max: boolean;
  won: boolean;
  payment_reminders: boolean;
  delivery_updates: boolean;
  dispute_updates: boolean;
  saved_search: boolean;
  /** "Offers and news" */
  marketing: boolean;
}

export interface NotificationPrefs extends AlertSwitches {
  /** How we reach you. The in-app list always gets everything. */
  channels: { push: boolean; email: boolean; sms: boolean };
  /** 10:00 pm – 7:00 am Lagos: no phone alerts, except payment deadlines and security. */
  quiet_hours: boolean;
  /** Older app versions read and write these three group switches. */
  bids: boolean;
  orders: boolean;
}

const SWITCH_DEFAULTS: AlertSwitches = {
  outbid: true,
  ending_soon: true,
  autobid_max: true,
  won: true,
  payment_reminders: true,
  delivery_updates: true,
  dispute_updates: true,
  saved_search: true,
  marketing: false,
};
const CHANNEL_DEFAULTS = { push: true, email: true, sms: false };

const GROUPS: Record<'bids' | 'orders', (keyof AlertSwitches)[]> = {
  bids: ['outbid', 'ending_soon', 'autobid_max', 'won'],
  orders: ['payment_reminders', 'delivery_updates', 'dispute_updates'],
};

export const DEFAULT_PREFS: NotificationPrefs = {
  ...SWITCH_DEFAULTS,
  channels: CHANNEL_DEFAULTS,
  quiet_hours: false,
  bids: true,
  orders: true,
};

/**
 * Which switch controls each type. Types not listed (account, security, support, admin)
 * always send. Typed loosely so new types can be mapped before the shared union has them.
 */
const SWITCH_FOR_TYPE: Record<string, keyof AlertSwitches> = {
  outbid: 'outbid',
  bid_placed: 'outbid',
  auction_ending_soon: 'ending_soon',
  auction_won: 'won',
  auction_lost: 'won',
  bid_defaulted: 'won',
  payment_reminder: 'payment_reminders',
  payment_failed: 'payment_reminders',
  payment_initiated: 'delivery_updates',
  payment_received: 'delivery_updates',
  order_created: 'delivery_updates',
  order_shipped: 'delivery_updates',
  order_delivered: 'delivery_updates',
  fulfillment_updated: 'delivery_updates',
  dispute_opened: 'dispute_updates',
  dispute_updated: 'dispute_updates',
  saved_search_match: 'saved_search',
  store_new_listing: 'saved_search',
};

/** Payment deadlines still reach the phone during quiet hours. */
const QUIET_HOURS_EXEMPT = new Set<string>(['payment_reminder', 'payment_failed', 'auction_won', 'bid_defaulted']);

/** Receipts for something the user just did themselves: phone and app only, never an extra email or text. */
const OWN_ACTION_TYPES = new Set<string>(['bid_placed', 'payment_initiated', 'order_created']);

const switchFor = (type: string, data?: Record<string, any>): keyof AlertSwitches | undefined =>
  // "Auto-bid hit your max" is sent as an outbid alert carrying the max.
  type === 'outbid' && data?.autoBidMax != null ? 'autobid_max' : SWITCH_FOR_TYPE[type];

/** 10:00 pm – 7:00 am in Lagos. */
const inQuietHours = (now = new Date()) => {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Lagos' }).format(now)
  );
  return hour >= 22 || hour < 7;
};

/** Stored JSON (old or new shape) → full preferences. */
const normalizePrefs = (stored: Record<string, any> | null | undefined): NotificationPrefs => {
  const raw = stored || {};
  const switches = { ...SWITCH_DEFAULTS };
  // Old group switches seed the rows they used to cover.
  for (const group of ['bids', 'orders'] as const) {
    if (typeof raw[group] === 'boolean') for (const k of GROUPS[group]) switches[k] = raw[group];
  }
  for (const k of Object.keys(SWITCH_DEFAULTS) as (keyof AlertSwitches)[]) {
    if (typeof raw[k] === 'boolean') switches[k] = raw[k];
  }
  const channels = { ...CHANNEL_DEFAULTS };
  for (const c of ['push', 'email', 'sms'] as const) {
    if (typeof raw.channels?.[c] === 'boolean') channels[c] = raw.channels[c];
  }
  return {
    ...switches,
    channels,
    quiet_hours: raw.quiet_hours === true,
    bids: GROUPS.bids.some(k => switches[k]),
    orders: GROUPS.orders.some(k => switches[k]),
  };
};

export const getPreferences = async (userId: string): Promise<NotificationPrefs> => {
  const rows = await query('SELECT notification_prefs FROM users WHERE id = $1', [userId]);
  return normalizePrefs(rows[0]?.notification_prefs);
};

export const updatePreferences = async (
  userId: string,
  changes: Partial<Omit<NotificationPrefs, 'channels'>> & { channels?: Partial<NotificationPrefs['channels']> }
): Promise<NotificationPrefs> => {
  const current = await getPreferences(userId);
  const next: NotificationPrefs = { ...current, channels: { ...current.channels } };
  // An old app flipping a group switch flips every row in it.
  for (const group of ['bids', 'orders'] as const) {
    if (typeof changes[group] === 'boolean') for (const k of GROUPS[group]) next[k] = changes[group] as boolean;
  }
  for (const k of Object.keys(SWITCH_DEFAULTS) as (keyof AlertSwitches)[]) {
    if (typeof changes[k] === 'boolean') next[k] = changes[k] as boolean;
  }
  for (const c of ['push', 'email', 'sms'] as const) {
    if (typeof changes.channels?.[c] === 'boolean') next.channels[c] = changes.channels[c] as boolean;
  }
  if (typeof changes.quiet_hours === 'boolean') next.quiet_hours = changes.quiet_hours;
  next.bids = GROUPS.bids.some(k => next[k]);
  next.orders = GROUPS.orders.some(k => next[k]);
  const { bids: _b, orders: _o, ...stored } = next;
  await query('UPDATE users SET notification_prefs = $2, updated_at = NOW() WHERE id = $1', [
    userId,
    JSON.stringify(stored),
  ]);
  return next;
};

const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

/** Plain alert email (design guide: one heading, no glass; footer says why they got it). */
const sendAlertEmail = async (userId: string, title: string, message: string) => {
  const rows = await query('SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
  const to = rows[0]?.email;
  if (!to) return;
  const { sendEmail } = await import('./email.service');
  await sendEmail({
    to,
    subject: title,
    html: `
      <div style="background:#F6F7FA;padding:32px 0;">
        <div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;max-width:680px;margin:0 auto;background:#FFFFFF;border-radius:18px;padding:32px;">
          <div style="font-size:17px;font-weight:600;color:#1C1F2A;margin-bottom:24px;">Gadgets Bidding</div>
          <h1 style="font-size:22px;font-weight:600;color:#1C1F2A;margin:0 0 12px;">${escapeHtml(title)}</h1>
          <p style="color:#5C6273;font-size:15px;line-height:1.6;margin:0;">${escapeHtml(message)}</p>
          <p style="color:#7C8293;font-size:12px;line-height:1.6;margin:28px 0 0;border-top:1px solid #EDEFF4;padding-top:16px;">
            You're getting this because email alerts are on. Turn them off in the app under Profile › Notifications. We'll never ask for your password or PIN by email.
          </p>
        </div>
      </div>`,
  });
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

  // The in-app list and the live socket always get it. The phone, email and SMS follow the
  // user's switches, channels and quiet hours.
  const prefs = await getPreferences(userId).catch(() => DEFAULT_PREFS);
  const sw = switchFor(type, data);
  const switchedOff = sw ? !prefs[sw] : false;
  const quiet = prefs.quiet_hours && sw !== undefined && !QUIET_HOURS_EXEMPT.has(type) && inQuietHours();

  // "How we reach you": alerts the user can switch on/off also go by email/SMS when they picked those.
  const send = new Set<NotificationChannel>(channels);
  if (sw && !OWN_ACTION_TYPES.has(type)) {
    if (prefs.channels.email) send.add('email');
    if (prefs.channels.sms) send.add('sms');
  }

  for (const channel of send) {
    try {
      switch (channel) {
        case 'push':
          socketService.emitToUser(userId, 'notification', {
            id: notification.id,
            type,
            title,
            message,
            data,
            timestamp: new Date(),
          });
          // To the phone itself, so it arrives with the app closed.
          // Not awaited: a slow push service must never hold up a bid or an order.
          if (switchedOff || quiet || !prefs.channels.push) break;
          void pushService.sendToUser(userId, {
            title,
            body: message,
            data: { ...(data || {}), type, notificationId: notification.id },
            urgent: URGENT_TYPES.has(type),
          });
          break;

        case 'sms': {
          if (switchedOff || quiet || !prefs.channels.sms) break;
          const userResult = await query('SELECT phone_number FROM users WHERE id = $1', [userId]);
          // Email/social sign-ups get a placeholder +9… number; never text it.
          // Not awaited, like push: a slow SMS or email provider must never hold up a bid.
          if (userResult.length > 0 && !String(userResult[0].phone_number).startsWith('+9')) {
            void smsService
              .sendSMS({ to: userResult[0].phone_number, message })
              .catch((e: unknown) => logger.error('Failed to send sms notification:', e));
          }
          break;
        }

        case 'email':
          if (switchedOff || !prefs.channels.email) break;
          void sendAlertEmail(userId, title, message).catch(e => logger.error('Failed to send email notification:', e));
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
    "You didn't win this one",
    `${gadgetTitle} sold to another bidder. Nothing was charged and your bid hold is back in your wallet.`,
    { auctionId },
    ['push']
  );
};

/** Bidders and watchers: it ended with nobody winning (bids under the reserve, or no bids). */
export const notifyAuctionNoSale = async (
  userId: string,
  auctionId: string,
  gadgetTitle: string,
  reason: 'reserve' | 'no_bids'
): Promise<void> => {
  await createNotification(
    userId,
    'auction_no_sale',
    'Ended without a sale',
    reason === 'reserve'
      ? `Bids on ${gadgetTitle} didn't reach the seller's reserve price, so nobody won. Nothing was charged.`
      : `Nobody bid on ${gadgetTitle}. We'll tell you if the seller relists it.`,
    { auctionId },
    ['push']
  );
};

/** People who bid on or watched an unsold auction: the seller put it up again. */
export const notifyAuctionRelisted = async (
  userId: string,
  auctionId: string,
  gadgetTitle: string
): Promise<void> => {
  await createNotification(
    userId,
    'auction_relisted',
    'Back up for auction',
    `${gadgetTitle} is listed again. Bidding is open now.`,
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
  watching = false,
  reminder?: string
): Promise<void> => {
  const left =
    minutesRemaining >= 55
      ? 'about an hour'
      : `${minutesRemaining} minute${minutesRemaining === 1 ? '' : 's'}`;
  await createNotification(
    userId,
    'auction_ending_soon',
    watching ? 'Ending soon on your watchlist' : 'Ending soon',
    `${gadgetTitle} ends in ${left}.`,
    { auctionId, minutesRemaining, ...(reminder && { reminder }) },
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
  value: string,
  /** Stage stored in data.reminder ('1h', '15m', '12h', '2h', 'hub_passed'): only that stage counts. */
  reminder?: string
): Promise<boolean> => {
  const rows = await query(
    `SELECT 1 FROM notifications
     WHERE user_id = $1 AND notification_type = $2 AND data->>'${key}' = $3
       AND ($4::text IS NULL OR data->>'reminder' = $4)
     LIMIT 1`,
    [userId, type, value, reminder ?? null]
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
  hoursLeft: number,
  reminder?: string
): Promise<void> => {
  const left = hoursLeft <= 1 ? 'less than an hour' : `about ${Math.round(hoursLeft)} hours`;
  await createNotification(
    userId,
    'payment_reminder',
    `Time to pay for ${gadgetTitle}`,
    `You have ${left} to pay ₦${amount.toLocaleString()} for order #${orderNumber}, or it goes to the next bidder.`,
    { orderId, orderNumber, ...(reminder && { reminder }) },
    ['push']
  );
};
