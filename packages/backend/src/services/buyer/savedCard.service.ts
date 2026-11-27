import axios from 'axios';
import crypto from 'crypto';
import prisma from '../../config/prisma';
import config from '../../config';
import logger from '../../utils/logger';
import * as orderService from '../order/order.service';
import * as paystackService from '../payment/paystack.service';
import { notifyCardPaymentFailed } from '../notification/buyerAlerts';
import type { PaymentTransaction } from '../../generated/prisma';

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

/**
 * Keep the card from a successful Paystack card transaction. Returns the saved row, or null when
 * the payment wasn't a reusable card. Same card (signature) again: refreshes it, no duplicate.
 */
const upsertFromGateway = async (userId: string, data: any) => {
  const auth = data?.authorization;
  if (!auth?.reusable || auth.channel !== 'card' || !auth.authorization_code) return null;
  const email = data?.customer?.email;
  if (!email || !auth.signature || !auth.last4) return null;

  const hasDefault = await prisma.savedCard.count({ where: { userId, isDefault: true } });
  return prisma.savedCard.upsert({
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
};

/** Call with Paystack's transaction data after any successful payment. Never throws. */
export const saveFromGateway = async (userId: string | null | undefined, data: any) => {
  try {
    if (!userId) return;
    if (data?.metadata?.save_card === false || data?.metadata?.save_card === 'false') return;
    await upsertFromGateway(userId, data);
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

/* ---------------- "+ Add a card": a ₦50 card check, refunded straight away ---------------- */
/*
 * Start: a card-only Paystack checkout for ₦50, recorded in payment_transactions with
 * metadata.purpose = 'card_verification' (never an order payment or a wallet top-up).
 * Finish (app verify or charge.success webhook, whichever comes first): save the card, then
 * refund the ₦50 through Paystack. Status stays within the table's check constraint:
 * pending → success once the card is saved and the refund is accepted (metadata.refund_id).
 * If the refund fails it stays pending with metadata.refund_error and is retried on the next
 * verify/webhook (the webhook answers 500 so Paystack keeps retrying). metadata.claimed_at
 * (epoch ms) makes sure only one request finishes a check at a time.
 */

export const CARD_CHECK_PURPOSE = 'card_verification';
/** Naira charged to check the card. Refunded in full. */
export const CARD_CHECK_AMOUNT = 50;
export const CARD_CHECK_FAILED = "We couldn't add that card. Try again or use another card.";
const CARD_CHECK_REFUND_NOTE = 'Gadgets Bidding card check refund (Add a card)';
/** A claim this old (server stopped mid-way) can be taken over. */
const STALE_CLAIM_MS = 2 * 60 * 1000;

/** Paystack hasn't decided yet, or another request is finishing this check right now. */
export class CardCheckPendingError extends Error {}

type PublicCard = ReturnType<typeof toPublic>;
export interface CardCheckResult {
  cards: PublicCard[];
  card: PublicCard | null;
  already_saved: boolean;
  refunded: boolean;
}

const asRecord = (v: unknown): Record<string, any> => {
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) || {};
    } catch {
      return {};
    }
  }
  return v && typeof v === 'object' ? (v as Record<string, any>) : {};
};
const isCardCheck = (metadata: unknown) => asRecord(metadata).purpose === CARD_CHECK_PURPOSE;

/** The card is charged under this email later, so it must be the one Paystack saw. */
const paystackEmail = async (userId: string) => {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, phoneNumber: true } });
  if (!u) throw new Error(CARD_CHECK_FAILED);
  return u.email || `${(u.phoneNumber || userId).replace(/\D/g, '')}@gadgetbid.ng`;
};

/** POST /me/cards/add — open a ₦50 card-only Paystack checkout. */
export const startCardCheck = async (userId: string) => {
  const email = await paystackEmail(userId);
  let init: Awaited<ReturnType<typeof paystackService.initializePayment>>;
  try {
    init = await paystackService.initializePayment(
      email,
      CARD_CHECK_AMOUNT,
      userId,
      {
        purpose: CARD_CHECK_PURPOSE,
        // Where Paystack sends the buyer on "Cancel payment"; the app stops the web view here.
        cancel_action: `${config.backendUrl}/wallet/verify?card_check=cancelled`,
      },
      ['card']
    );
  } catch {
    throw new Error(CARD_CHECK_FAILED);
  }

  // Recorded before the buyer can pay, so the webhook always finds it.
  await prisma.paymentTransaction.create({
    data: {
      userId,
      paymentGateway: 'paystack',
      gatewayReference: init.reference,
      amount: CARD_CHECK_AMOUNT,
      currency: 'NGN',
      paymentMethod: 'card',
      status: 'pending',
      metadata: { purpose: CARD_CHECK_PURPOSE },
    },
  });
  logger.info(`Card check started: ${init.reference}`);
  return { authorization_url: init.authorization_url, reference: init.reference, amount: CARD_CHECK_AMOUNT };
};

const checkResult = async (
  userId: string,
  cardId: unknown,
  alreadySaved: boolean,
  refunded: boolean
): Promise<CardCheckResult> => {
  const cards = await list(userId);
  return { cards, card: cards.find(c => c.id === cardId) ?? null, already_saved: alreadySaved, refunded };
};

/** Save the card and refund the ₦50. `paid` is Paystack's transaction (webhook body or verify). */
const settleCardCheck = async (tx: PaymentTransaction, paid?: any): Promise<CardCheckResult> => {
  const userId = tx.userId as string;
  const reference = tx.gatewayReference as string;
  const meta = asRecord(tx.metadata);
  if (tx.status === 'success') return checkResult(userId, meta.card_id, !!meta.already_saved, true);

  const data = paid ?? (await paystackService.paymentState(reference)).gatewayResponse;
  const status = String(data?.status || '');
  if (status === 'failed') {
    await prisma.paymentTransaction.updateMany({
      where: { id: tx.id, status: 'pending' },
      data: { status: 'failed', updatedAt: new Date() },
    });
    throw new Error(CARD_CHECK_FAILED);
  }
  if (status === 'abandoned') throw new Error("You didn't finish adding the card. No money was taken.");
  // "reversal-pending" / "reversed": refunded already (an earlier attempt got through but wasn't recorded).
  const alreadyRefunded = status === 'reversed' || status === 'reversal-pending';
  if (status !== 'success' && !alreadyRefunded) {
    throw new CardCheckPendingError(
      "Your bank hasn't confirmed the card yet. If it goes through, it'll show here in a few minutes."
    );
  }

  // One request at a time finishes a check (the app and the webhook can arrive together).
  const nowMs = Date.now();
  const claimed = await prisma.$executeRaw`
    UPDATE payment_transactions
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('claimed_at', ${nowMs}::bigint)
     WHERE id = ${tx.id}::uuid
       AND status IN ('pending', 'failed')
       AND COALESCE((metadata->>'claimed_at')::bigint, 0) < ${nowMs - STALE_CLAIM_MS}::bigint`;
  if (claimed === 0) {
    // Someone else is finishing it: wait a few seconds for their result.
    for (let i = 0; i < 16; i++) {
      const fresh = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
      const freshMeta = asRecord(fresh?.metadata);
      if (fresh?.status === 'success') return checkResult(userId, freshMeta.card_id, !!freshMeta.already_saved, true);
      if (!freshMeta.claimed_at) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new CardCheckPendingError("We're still checking that card. Give it a moment.");
  }

  const gatewayMeta = asRecord(data.metadata);
  const genuine =
    Math.round(Number(data.amount)) === CARD_CHECK_AMOUNT * 100 &&
    String(data.currency || 'NGN') === 'NGN' &&
    isCardCheck(gatewayMeta) &&
    (!gatewayMeta.user_id || gatewayMeta.user_id === userId);

  let cardId: string | null = (meta.card_id as string) || null;
  let alreadySaved = !!meta.already_saved;
  if (!genuine) {
    logger.error(`Card check ${reference} doesn't match what we started; refunding without saving the card`);
  } else if (!cardId) {
    try {
      const signature = data?.authorization?.signature;
      alreadySaved =
        !!signature &&
        !!(await prisma.savedCard.findUnique({
          where: { userId_signature: { userId, signature } },
          select: { id: true },
        }));
      cardId = (await upsertFromGateway(userId, data))?.id ?? null;
    } catch (err) {
      logger.error(`Card check ${reference}: could not save the card:`, err);
    }
  }

  let refund: { id: string; status: string } | null = null;
  let refundError: string | null = null;
  if (alreadyRefunded) {
    refund = { id: String(meta.refund_id ?? ''), status };
  } else {
    try {
      refund = await paystackService.refundTransaction(reference, CARD_CHECK_REFUND_NOTE);
    } catch (err) {
      refundError = err instanceof Error ? err.message : 'Refund could not be started';
      // Already refunded by an earlier attempt that we didn't get to record
      // (Paystack: "A refund already exist for this transaction").
      if (/refund already exist|fully reversed/i.test(refundError)) {
        refund = { id: String(meta.refund_id ?? ''), status: 'pending' };
        refundError = null;
      } else {
        logger.error(`Card check ${reference}: refund failed: ${refundError}`);
      }
    }
  }

  await prisma.paymentTransaction.update({
    where: { id: tx.id },
    data: {
      // Refund not accepted yet: stays pending so the next verify/webhook retries it.
      status: refund ? 'success' : 'pending',
      // Not the whole Paystack body: it carries the reusable authorization code.
      gatewayResponse: {
        id: data.id ?? null,
        status,
        amount: data.amount ?? null,
        currency: data.currency ?? null,
        channel: data.channel ?? null,
        gateway_response: data.gateway_response ?? null,
        paid_at: data.paid_at ?? data.paidAt ?? null,
      },
      metadata: {
        ...meta,
        purpose: CARD_CHECK_PURPOSE,
        card_id: cardId,
        already_saved: alreadySaved,
        refund_id: refund?.id ?? null,
        refund_status: refund?.status ?? null,
        refund_error: refundError,
        claimed_at: null,
      },
      updatedAt: new Date(),
    },
  });
  logger.info(`Card check ${reference}: card ${cardId ? 'saved' : 'not saved'}, ${refund ? 'refunded' : 'refund pending'}`);
  return checkResult(userId, cardId, alreadySaved, !!refund);
};

/** POST /me/cards/add/verify — the app's check after the Paystack page returns. */
export const finishCardCheck = async (userId: string, reference: string) => {
  const tx = await prisma.paymentTransaction.findFirst({ where: { gatewayReference: reference, userId } });
  if (!tx || !isCardCheck(tx.metadata)) {
    throw new Error("We couldn't find that card check. Try adding the card again.");
  }
  const result = await settleCardCheck(tx);
  if (!result.card) {
    throw new Error(
      result.refunded
        ? "We couldn't save that card, so we refunded the ₦50 check. Try another card."
        : CARD_CHECK_FAILED
    );
  }
  const message = result.already_saved
    ? result.refunded
      ? 'That card is already saved. We refunded the ₦50 check.'
      : "That card is already saved. We'll refund the ₦50 check shortly."
    : result.refunded
      ? 'Card added. We refunded the ₦50 check.'
      : "Card added. We'll refund the ₦50 check shortly.";
  return { ...result, message };
};

/** Is this Paystack reference an "Add a card" check? (Paystack's metadata, or our own record.) */
export const isCardCheckReference = async (reference: string, gatewayMetadata?: unknown) => {
  if (isCardCheck(gatewayMetadata)) return true;
  if (!reference) return false;
  const tx = await prisma.paymentTransaction.findFirst({
    where: { gatewayReference: reference },
    select: { metadata: true },
  });
  return isCardCheck(tx?.metadata);
};

/**
 * charge.success webhook for a card check: save the card and refund it. Throws (so Paystack
 * retries) while another request is mid-way or the refund hasn't gone through yet.
 */
export const settleCardCheckFromWebhook = async (reference: string, data: any) => {
  const tx = await prisma.paymentTransaction.findFirst({ where: { gatewayReference: reference } });
  if (!tx?.userId || !isCardCheck(tx.metadata)) {
    logger.error(`Card check webhook with no matching record: ${reference}. Refund it from the Paystack dashboard.`);
    return;
  }
  const result = await settleCardCheck(tx, data);
  if (!result.refunded) throw new Error(`Card check ${reference} is not refunded yet`);
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
