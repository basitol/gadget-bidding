import axios from 'axios';
import crypto from 'crypto';
import prisma from '../../config/prisma';
import config from '../../config';
import logger from '../../utils/logger';
import * as orderService from '../order/order.service';
import { notifyCardPaymentFailed } from '../notification/buyerAlerts';

/**
 * Saved cards. Paystack returns a reusable "authorization" after a successful card payment;
 * we keep it so the next payment is one tap (charge_authorization). The authorization code is a
 * secret and never leaves the backend; the app only sees brand, last 4 and expiry.
 */

const PAYSTACK = 'https://api.paystack.co';

const toPublic = (c: any) => ({
  id: c.id,
  brand: c.brand,
  last4: c.last4,
  exp_month: c.expMonth,
  exp_year: c.expYear,
  bank: c.bank,
  is_default: c.isDefault,
  label: `${c.brand.charAt(0).toUpperCase()}${c.brand.slice(1)} ending ${c.last4}`,
});

/** Call with Paystack's transaction data after any successful payment. Never throws. */
export const saveFromGateway = async (userId: string | null | undefined, data: any) => {
  try {
    const auth = data?.authorization;
    if (!userId || !auth?.reusable || auth.channel !== 'card' || !auth.authorization_code) return;
    if (data?.metadata?.save_card === false || data?.metadata?.save_card === 'false') return;
    const email = data?.customer?.email;
    if (!email || !auth.signature || !auth.last4) return;

    const hasDefault = await prisma.savedCard.count({ where: { userId, isDefault: true } });
    await prisma.savedCard.upsert({
      where: { userId_signature: { userId, signature: auth.signature } },
      create: {
        userId,
        authorizationCode: auth.authorization_code,
        signature: auth.signature,
        email,
        brand: String(auth.card_type || auth.brand || 'card').trim().toLowerCase(),
        last4: String(auth.last4),
        expMonth: String(auth.exp_month || '').padStart(2, '0'),
        expYear: String(auth.exp_year || ''),
        bank: auth.bank || null,
        isDefault: hasDefault === 0,
      },
      // Same card paid again: refresh the token and expiry.
      update: {
        authorizationCode: auth.authorization_code,
        email,
        expMonth: String(auth.exp_month || '').padStart(2, '0'),
        expYear: String(auth.exp_year || ''),
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    logger.warn('Could not save card from payment:', err);
  }
};

export const list = async (userId: string) =>
  (
    await prisma.savedCard.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    })
  ).map(toPublic);

export const remove = async (userId: string, id: string) => {
  const card = await prisma.savedCard.findFirst({ where: { id, userId } });
  if (!card) return;
  await prisma.savedCard.delete({ where: { id } });
  if (card.isDefault) {
    const next = await prisma.savedCard.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
    if (next) await prisma.savedCard.update({ where: { id: next.id }, data: { isDefault: true } });
  }
};

export const makeDefault = async (userId: string, id: string) => {
  const card = await prisma.savedCard.findFirst({ where: { id, userId } });
  if (!card) throw new Error('Card not found');
  await prisma.$transaction([
    prisma.savedCard.updateMany({ where: { userId }, data: { isDefault: false } }),
    prisma.savedCard.update({ where: { id }, data: { isDefault: true } }),
  ]);
};

/** Pay an order with a saved card. Marks the order paid when Paystack confirms the charge. */
export const payOrder = async (buyerId: string, orderId: string, cardId: string) => {
  const card = await prisma.savedCard.findFirst({ where: { id: cardId, userId: buyerId } });
  if (!card) throw new Error('Card not found');

  const order = await prisma.order.findFirst({ where: { id: orderId, buyerId } });
  if (!order) throw new Error('Order not found');
  if (order.paymentStatus === 'paid') throw new Error('Order already paid');
  if (order.deliveryMethod !== 'pickup' && !orderService.hasCompleteShippingAddress(order.shippingAddress)) {
    throw new Error('Please add a shipping address before paying for this order');
  }

  const amount = Number(order.totalAmount);
  const reference = `PAYC-${crypto.randomUUID()}`;
  const metadata = { purpose: 'order_payment', order_id: orderId, order_number: order.orderNumber };

  // Recorded first so the webhook (which may arrive before our response) finds it.
  await prisma.paymentTransaction.create({
    data: {
      userId: buyerId,
      paymentGateway: 'paystack',
      gatewayReference: reference,
      amount,
      currency: 'NGN',
      status: 'pending',
      metadata,
    },
  });

  let data: any;
  try {
    const res = await axios.post(
      `${PAYSTACK}/transaction/charge_authorization`,
      {
        authorization_code: card.authorizationCode,
        email: card.email,
        amount: Math.round(amount * 100),
        currency: 'NGN',
        reference,
        metadata: { user_id: buyerId, ...metadata },
      },
      { headers: { Authorization: `Bearer ${config.paystack.secretKey}` }, timeout: 30000 }
    );
    data = res.data?.data;
  } catch (err: any) {
    logger.error('Saved card charge failed:', err?.response?.data || err?.message);
    await prisma.paymentTransaction.updateMany({
      where: { gatewayReference: reference, status: 'pending' },
      data: { status: 'failed' },
    });
    void notifyCardPaymentFailed(orderId, orderService.ORDER_PAYMENT_EXPIRY_HOURS, 'Try another card or your wallet.');
    throw new Error(err?.response?.data?.message || 'Your card could not be charged. Try another way to pay.');
  }

  if (data?.status !== 'success') {
    await prisma.paymentTransaction.updateMany({
      where: { gatewayReference: reference, status: 'pending' },
      data: { status: 'failed' },
    });
    void notifyCardPaymentFailed(orderId, orderService.ORDER_PAYMENT_EXPIRY_HOURS, 'Try another card or your wallet.');
    throw new Error(
      data?.gateway_response && data.gateway_response !== 'Approved'
        ? `Your bank declined this: ${data.gateway_response}`
        : 'Your bank needs you to confirm this one. Pay with your card instead.'
    );
  }

  const paid = await orderService.processOrderPayment(orderId, reference, Number(data.amount) / 100, data);
  return { order: paid, reference };
};
