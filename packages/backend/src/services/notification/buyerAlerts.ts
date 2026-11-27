import prisma from '../../config/prisma';
import logger from '../../utils/logger';
import { createNotification, alreadyNotified } from './notification.service';

/**
 * Buyer-facing order alerts (Notifications screen): hub arrival, inspection passed / on its way,
 * confirm-delivery reminders and failed card payments. Each is sent once per order.
 */

/** Remind the buyer to confirm delivery this long after it was shipped. */
const CONFIRM_REMINDER_HOURS = Number(process.env.CONFIRM_DELIVERY_REMINDER_HOURS || 48);

const orderInfo = async (orderId: string) => {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      orderNumber: true,
      totalAmount: true,
      createdAt: true,
      trackingNumber: true,
      auction: { select: { gadget: { select: { title: true } } } },
    },
  });
  return o ? { ...o, title: o.auction?.gadget?.title || 'Your gadget' } : null;
};

export const notifyBuyerFulfillment = async (orderId: string, status: string) => {
  try {
    const o = await orderInfo(orderId);
    if (!o?.buyerId) return;
    const data = { orderId: o.id, orderNumber: o.orderNumber, status };

    if (status === 'received_by_backoffice') {
      if (await alreadyNotified(o.buyerId, 'fulfillment_updated', 'orderId', o.id)) return;
      await createNotification(
        o.buyerId,
        'fulfillment_updated',
        'At our hub for inspection',
        `${o.title} arrived at our Computer Village hub. We're checking it against the listing now.`,
        data,
        ['push']
      );
    } else if (status === 'shipped') {
      if (await alreadyNotified(o.buyerId, 'order_shipped', 'orderId', o.id)) return;
      await createNotification(
        o.buyerId,
        'order_shipped',
        'Passed hub inspection',
        `Your ${o.title} matched the listing and is on its way.${o.trackingNumber ? ` Tracking: ${o.trackingNumber}.` : ''}`,
        data,
        ['push', 'sms']
      );
    } else if (status === 'cancelled') {
      await createNotification(
        o.buyerId,
        'system',
        'Order cancelled',
        `Order #${o.orderNumber} for ${o.title} was cancelled. Any payment is refunded to your wallet.`,
        data,
        ['push']
      );
    }
  } catch (err) {
    logger.error('Buyer fulfillment alert failed:', err);
  }
};

/** Job: shipped a while ago and still not confirmed → nudge the buyer (once). */
export const remindConfirmDelivery = async () => {
  const due = await prisma.$queryRaw<{ order_id: string; buyer_id: string }[]>`
    SELECT o.id AS order_id, o.buyer_id
    FROM orders o
    JOIN notifications n
      ON n.user_id = o.buyer_id
     AND n.notification_type = 'order_shipped'
     AND n.data->>'orderId' = o.id::text
    WHERE o.fulfillment_status = 'shipped'
      AND n.created_at <= NOW() - make_interval(hours => ${CONFIRM_REMINDER_HOURS})
    LIMIT 100`;
  for (const row of due) {
    if (await alreadyNotified(row.buyer_id, 'order_delivered', 'orderId', row.order_id)) continue;
    const o = await orderInfo(row.order_id);
    if (!o) continue;
    await createNotification(
      row.buyer_id,
      'order_delivered',
      `Has your ${o.title} arrived?`,
      'Check it and confirm, so we can pay the seller. Something wrong? Open a dispute instead.',
      { orderId: o.id, orderNumber: o.orderNumber, action: 'confirm_delivery' },
      ['push']
    );
  }
};

/** A saved-card charge failed: tell the buyer how long they still have. */
export const notifyCardPaymentFailed = async (orderId: string, paymentWindowHours: number, reason: string) => {
  try {
    const o = await orderInfo(orderId);
    if (!o?.buyerId || !o.createdAt) return;
    const msLeft = o.createdAt.getTime() + paymentWindowHours * 3600_000 - Date.now();
    const h = Math.max(0, Math.floor(msLeft / 3600_000));
    const m = Math.max(0, Math.floor((msLeft % 3600_000) / 60_000));
    await createNotification(
      o.buyerId,
      'payment_failed',
      "Payment didn't go through",
      `${o.title} · you have ${h}h ${m}m left to pay. ${reason}`.trim(),
      { orderId: o.id, orderNumber: o.orderNumber },
      ['push']
    );
  } catch (err) {
    logger.error('Payment failed alert failed:', err);
  }
};
