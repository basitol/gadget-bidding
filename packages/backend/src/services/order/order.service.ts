import prisma from '../../config/prisma';
import { Prisma } from '../../generated/prisma';
import {
  BID_DEFAULT_PENALTY_AMOUNT,
  BID_PAYMENT_DEADLINE_HOURS,
  Order,
  OrderWithDetails,
  ShippingAddress,
  FulfillmentStatus,
  PaymentStatusType,
  platformFeeFor,
  PaystackInitializeResponse,
} from '@gadget-bidding/shared';
import * as paystackService from '../payment/paystack.service';
import config from '../../config';
import * as buyerAlerts from '../notification/buyerAlerts';
import * as notificationService from '../notification/notification.service';
import * as emailService from '../notification/email.service';
import * as riskService from '../risk/risk.service';
import { applyBalanceDelta } from '../../utils/wallet-balance';
import logger from '../../utils/logger';

// Helper to convert Prisma Decimal to number
const toNumber = (value: any): number => {
  if (!value) return 0;
  return parseFloat(value.toString());
};

/**
 * Generate unique order number
 */
const generateOrderNumber = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `GB-${timestamp}-${random}`;
};

export const ORDER_PAYMENT_EXPIRY_HOURS = Number(
  process.env.ORDER_PAYMENT_EXPIRY_HOURS || BID_PAYMENT_DEADLINE_HOURS
);
/** After delivery the buyer has this long to confirm or report a problem; then we confirm for them. */
export const CONFIRM_WINDOW_HOURS = Number(process.env.CONFIRM_WINDOW_HOURS || 48);
/** A second-chance offer stays open this long. */
export const OFFER_WINDOW_HOURS = Number(process.env.SECOND_CHANCE_OFFER_HOURS || 12);
/** Missed payments: after this many within the lookback, bidding pauses. */
export const MISSED_PAYMENT_LIMIT = 3;
export const MISSED_PAYMENT_LOOKBACK_DAYS = 90;
export const BIDDING_PAUSE_DAYS = 30;
/** One-time transfer accounts stay open this long. */
export const TRANSFER_ACCOUNT_MINUTES = 30;

const HOUR = 3_600_000;

/** When an unpaid order must be paid by. */
export const paymentDueOf = (order: { paymentDueAt?: Date | null; createdAt?: Date | null }): Date | null =>
  order.paymentDueAt ??
  (order.createdAt ? new Date(order.createdAt.getTime() + ORDER_PAYMENT_EXPIRY_HOURS * HOUR) : null);

/** When the order was marked delivered (latest event), if it was. */
const deliveredAtOf = (order: any): Date | null => {
  const hits = (order.events ?? []).filter((e: any) => e.kind === 'fulfillment' && e.status === 'delivered');
  return hits.length ? hits[hits.length - 1].createdAt : order.fulfillmentStatus === 'delivered' ? order.updatedAt : null;
};

/* ---------------- Hub: seller drop-off deadline ---------------- */

/** Lagos is UTC+1 all year (WAT has no daylight saving). */
const LAGOS_UTC_OFFSET_HOURS = 1;
/** After the buyer pays, the seller drops the item at the Computer Village hub by this hour (Lagos)... */
export const DROPOFF_CUTOFF_HOUR = 18;
/** ...on the next day the hub is open. It's open Monday to Saturday (0 = Sunday). */
export const HUB_CLOSED_WEEKDAYS: number[] = [0];
/** "6 pm" */
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
export const DROPOFF_RULE = `By ${hourLabel(DROPOFF_CUTOFF_HOUR)} the next working day after payment`;

/** The drop-off deadline for an order paid at `paidAt`: 6:00 pm Lagos on the next hub working day. */
export const dropoffDueAt = (paidAt: Date): Date => {
  const lagos = new Date(paidAt.getTime() + LAGOS_UTC_OFFSET_HOURS * HOUR);
  const day = new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate() + 1));
  while (HUB_CLOSED_WEEKDAYS.includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
  return new Date(day.getTime() + (DROPOFF_CUTOFF_HOUR - LAGOS_UTC_OFFSET_HOURS) * HOUR);
};

/** Paid, but the seller hasn't sent it to the hub yet. */
const BEFORE_HUB_STATUSES = ['pending', 'processing'];

/** When the order was paid (latest 'paid' payment event), if it was. */
const paidAtOf = (order: any): Date | null => {
  const hits = (order.events ?? []).filter((e: any) => e.kind === 'payment' && e.status === 'paid');
  return hits.length ? hits[hits.length - 1].createdAt : null;
};

/** Drop-off deadline while the item hasn't reached the hub yet; null otherwise. */
export const dropoffDueOf = (order: any): Date | null => {
  if (order.paymentStatus !== 'paid' || !BEFORE_HUB_STATUSES.includes(order.fulfillmentStatus ?? 'pending')) return null;
  const paidAt = paidAtOf(order);
  return paidAt ? dropoffDueAt(paidAt) : null;
};

/* ---------------- Hub: inspection checklist ---------------- */

/** What the hub checks on every device before it leaves, in this order. */
export const HUB_INSPECTION_CHECKS = [
  { key: 'imei_match', label: 'IMEI or serial matches the listing' },
  { key: 'not_stolen', label: 'Not reported lost or stolen' },
  { key: 'account_removed', label: 'iCloud or Google account removed' },
  { key: 'screen', label: 'Screen and touch work' },
  { key: 'battery', label: 'Battery health as listed' },
  { key: 'cameras_audio', label: 'Cameras, speakers and mics work' },
  { key: 'body_grade', label: 'Body and grade match the photos' },
] as const;

export type InspectionRecord = {
  checks: { key: string; label: string; passed: boolean }[];
  /** How many checks passed. */
  passed: number;
  total: number;
  note: string | null;
  /** Staff member who did the check (admin views only, never shown to buyers or sellers). */
  by: { id: string; name: string | null };
  at: string;
};

/** Statuses where the item is with us at the hub. */
const AT_HUB_STATUSES = ['sent_to_backoffice', 'received_by_backoffice'];

const readInspection = (value: unknown): InspectionRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as InspectionRecord;
  return Array.isArray(v.checks) && typeof v.total === 'number' ? v : null;
};

/** Every one of the hub's checks was recorded and passed. */
export const inspectionPassed = (value: unknown): boolean => {
  const i = readInspection(value);
  if (!i) return false;
  const passedKeys = new Set(i.checks.filter(c => c.passed === true).map(c => c.key));
  return HUB_INSPECTION_CHECKS.every(c => passedKeys.has(c.key));
};

/** What buyers and sellers see: the score and when, never who checked it. */
const inspectionSummary = (value: unknown) => {
  const i = readInspection(value);
  return i ? { passed: i.passed, total: i.total, at: i.at } : null;
};

/** Accepts `{ imei_match: true, ... }` or `[{ key: 'imei_match', passed: true }, ...]`. */
const normalizeChecks = (input: unknown): Map<string, boolean> => {
  const out = new Map<string, boolean>();
  const known = new Set<string>(HUB_INSPECTION_CHECKS.map(c => c.key));
  const add = (key: unknown, passed: unknown) => {
    if (typeof key !== 'string' || !known.has(key)) throw new Error(`"${String(key)}" isn't one of the hub checks.`);
    if (typeof passed !== 'boolean') throw new Error('Mark each check as passed or not.');
    out.set(key, passed);
  };
  if (Array.isArray(input)) input.forEach(c => add(c?.key, c?.passed));
  else if (input && typeof input === 'object') Object.entries(input).forEach(([k, v]) => add(k, v));
  else throw new Error('Send the result of each hub check.');
  const missing = HUB_INSPECTION_CHECKS.filter(c => !out.has(c.key));
  if (missing.length) throw new Error(`Every check needs an answer. Missing: ${missing.map(c => c.label).join(', ')}.`);
  return out;
};

/**
 * Hub staff record what they checked on an order at the hub. Any failed check needs a note.
 * Recording again replaces the earlier result (every save is in the audit log).
 */
export const recordInspection = async (
  orderId: string,
  staff: { id: string; name: string | null },
  input: { checks?: unknown; note?: unknown }
): Promise<{ order_id: string; order_number: string; inspection: InspectionRecord; all_passed: boolean }> => {
  const results = normalizeChecks(input.checks);
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > 500) throw new Error('Keep the note under 500 characters.');
  const checks = HUB_INSPECTION_CHECKS.map(c => ({ key: c.key, label: c.label, passed: results.get(c.key)! }));
  const passed = checks.filter(c => c.passed).length;
  if (passed < checks.length && !note) throw new Error("Add a note saying what didn't pass.");

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, paymentStatus: true, fulfillmentStatus: true },
  });
  if (!order) throw new Error('Order not found');
  if (order.paymentStatus !== 'paid') throw new Error('Only paid orders are checked at the hub.');
  if (order.fulfillmentStatus !== 'received_by_backoffice') {
    throw new Error(
      order.fulfillmentStatus === 'sent_to_backoffice'
        ? 'Mark it received at the hub first, then record the check.'
        : ['shipped', 'delivered'].includes(order.fulfillmentStatus ?? '')
          ? 'This order has already left the hub.'
          : "This order isn't at the hub."
    );
  }

  const inspection: InspectionRecord = {
    checks,
    passed,
    total: checks.length,
    note: note || null,
    by: staff,
    at: new Date().toISOString(),
  };
  // Only while it's still at the hub, in case someone moved it on meanwhile.
  const saved = await prisma.order.updateMany({
    where: { id: orderId, fulfillmentStatus: 'received_by_backoffice' },
    data: { inspection: inspection as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
  });
  if (saved.count === 0) throw new Error('This order just moved on from the hub. Refresh and try again.');

  logger.info(`Hub inspection for ${order.orderNumber}: ${passed} of ${checks.length} passed`);
  return { order_id: order.id, order_number: order.orderNumber, inspection, all_passed: passed === checks.length };
};

const formatDispute = (dispute: any) => ({
  id: dispute.id,
  case_number: dispute.caseNumber ? `D-${dispute.caseNumber}` : undefined,
  outcome: dispute.outcome ?? null,
  order_id: dispute.orderId,
  raised_by: dispute.raisedBy,
  dispute_type: dispute.disputeType,
  description: dispute.description,
  evidence: dispute.evidence,
  status: dispute.status,
  resolution: dispute.resolution,
  resolved_by: dispute.resolvedBy,
  resolved_at: dispute.resolvedAt?.toISOString(),
  created_at: dispute.createdAt?.toISOString(),
  updated_at: dispute.updatedAt?.toISOString(),
});

const fulfillmentStatusLabel = (status: FulfillmentStatus): string => {
  const labels: Record<FulfillmentStatus, string> = {
    pending: 'Pending',
    processing: 'Processing',
    sent_to_backoffice: 'Sent to backoffice',
    received_by_backoffice: 'Received by backoffice',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  };

  return labels[status] ?? 'Updated';
};

const readableActionLabel = (value: string): string =>
  value
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

// Helper to transform Prisma order to shared Order type
const transformOrder = (order: any): Order => ({
  id: order.id,
  auction_id: order.auctionId,
  buyer_id: order.buyerId,
  seller_id: order.sellerId,
  order_number: order.orderNumber,
  total_amount: toNumber(order.totalAmount),
  delivery_fee: toNumber(order.deliveryFee),
  delivery_method: order.deliveryMethod ?? 'delivery',
  item_amount: toNumber(order.totalAmount) - toNumber(order.deliveryFee),
  platform_fee: toNumber(order.platformFee),
  seller_payout: toNumber(order.sellerPayout),
  payout_status: order.payoutStatus,
  payout_paid_at: order.payoutPaidAt?.toISOString(),
  payout_reference: order.payoutReference,
  payment_status: order.paymentStatus as PaymentStatusType,
  fulfillment_status: order.fulfillmentStatus as FulfillmentStatus,
  shipping_address: order.shippingAddress,
  tracking_number: order.trackingNumber,
  disputes: order.disputes?.map(formatDispute),
  open_dispute: order.disputes?.some((d: any) => ['open', 'investigating'].includes(d.status)),
  // A refund was decided but the item isn't back yet: the order stays on hold until it is.
  refund_pending: order.paymentStatus !== 'refunded' && !!order.disputes?.some((d: any) => d.outcome === 'refund'),
  created_at: order.createdAt?.toISOString(),
  updated_at: order.updatedAt?.toISOString(),
});

/**
 * Create order from won auction
 */
export const createOrderFromAuction = async (
  auctionId: string,
  winnerId: string,
  finalPrice: number
): Promise<Order> => {
  return prisma.$transaction(async tx => {
    // Get auction with gadget
    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
      include: { gadget: true },
    });

    if (!auction) {
      throw new Error('Auction not found');
    }

    // Check if order already exists
    const existingOrder = await tx.order.findUnique({
      where: { auctionId },
    });

    if (existingOrder) {
      logger.info(`Order already exists for auction ${auctionId}`);
      return transformOrder(existingOrder);
    }

    // Fee by price band (seller agreement): taken from the seller's payout.
    const platformFee = platformFeeFor(finalPrice);
    const sellerPayout = finalPrice - platformFee;

    // Create order: winning bid + flat delivery (delivery goes to the platform, not the seller)
    const deliveryFee = config.deliveryFee;
    const order = await tx.order.create({
      data: {
        auctionId,
        buyerId: winnerId,
        sellerId: auction.gadget?.sellerId,
        orderNumber: generateOrderNumber(),
        totalAmount: finalPrice + deliveryFee,
        deliveryFee,
        platformFee,
        sellerPayout,
        payoutStatus: 'pending',
        paymentStatus: 'pending',
        fulfillmentStatus: 'pending',
      },
    });

    // Ensure auction points to the winner even when order creation is retried
    await tx.auction.update({
      where: { id: auctionId },
      data: { status: 'ended', winnerId },
    });

    logger.info(`Order created: ${order.orderNumber} for auction ${auctionId}`);

    return transformOrder(order);
  });
};

/**
 * Get order by ID
 */
export const getOrderById = async (
  orderId: string
): Promise<OrderWithDetails | null> => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      auction: {
        include: {
          gadget: true,
        },
      },
      buyer: {
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
        },
      },
      seller: {
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
        },
      },
      disputes: {
        orderBy: { createdAt: 'desc' },
      },
      events: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!order) {
    return null;
  }

  return formatOrderWithDetails(order);
};

/**
 * Get order by order number
 */
export const getOrderByNumber = async (
  orderNumber: string
): Promise<OrderWithDetails | null> => {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: {
      auction: {
        include: {
          gadget: true,
        },
      },
      buyer: {
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
        },
      },
      seller: {
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
        },
      },
      disputes: {
        orderBy: { createdAt: 'desc' },
      },
      events: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!order) {
    return null;
  }

  return formatOrderWithDetails(order);
};

/**
 * Get user's orders (as buyer)
 */
export const getBuyerOrders = async (
  buyerId: string,
  page: number = 1,
  limit: number = 20,
  status?: FulfillmentStatus
): Promise<{ orders: OrderWithDetails[]; total: number }> => {
  const where: any = { buyerId };
  if (status) {
    where.fulfillmentStatus = status;
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        auction: {
          include: {
            gadget: true,
          },
        },
        buyer: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
          },
        },
        seller: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
          },
        },
        disputes: {
          orderBy: { createdAt: 'desc' },
        },
        events: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders: orders.map(formatOrderWithDetails),
    total,
  };
};

/**
 * Get user's orders (as seller)
 */
export const getSellerOrders = async (
  sellerId: string,
  page: number = 1,
  limit: number = 20,
  status?: FulfillmentStatus
): Promise<{ orders: OrderWithDetails[]; total: number }> => {
  const where: any = { sellerId };
  if (status) {
    where.fulfillmentStatus = status;
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        auction: {
          include: {
            gadget: true,
          },
        },
        buyer: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
          },
        },
        seller: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
          },
        },
        disputes: {
          orderBy: { createdAt: 'desc' },
        },
        events: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders: orders.map(formatOrderWithDetails),
    total,
  };
};

export const hasCompleteShippingAddress = (address: unknown): boolean => {
  if (!address || typeof address !== 'object') return false;
  const a = address as Record<string, unknown>;
  return Boolean(
    a.full_name && a.phone_number && a.address_line1 && a.city && a.state
  );
};

export type SecondPlaceOfferResult = {
  order: Order;
  bidder: {
    id: string;
    fullName: string | null;
    phoneNumber: string | null;
    email: string | null;
    amount: number;
  };
};

/**
 * Give the order to the next highest bidder as a second-chance offer, inside the caller's
 * transaction. Bidders whose bids are withdrawn (missed payment, declined) are skipped.
 * The offer stays open OFFER_WINDOW_HOURS; accepting starts a fresh payment window.
 */
const reassignToNextBidder = async (tx: any, orderId: string) => {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { auction: { include: { gadget: true } } },
  });
  if (!order) throw new Error('Order not found');
  if (!order.auctionId || !order.buyerId) throw new Error('Order is missing auction or buyer details');
  if (order.paymentStatus === 'paid') throw new Error('Paid orders cannot be reassigned');

  const nextBid = await tx.bid.findFirst({
    where: { auctionId: order.auctionId, bidderId: { not: order.buyerId }, status: { not: 'withdrawn' } },
    include: { bidder: { select: { id: true, fullName: true, phoneNumber: true, email: true } } },
    orderBy: [{ amount: 'desc' }, { bidTime: 'asc' }],
  });
  if (!nextBid?.bidderId || !nextBid.bidder) throw new Error('No second-place bidder is available');

  const amount = toNumber(nextBid.amount);
  const platformFee = platformFeeFor(amount);

  // Void the previous buyer's pending payment references so they can never settle this order.
  await tx.paymentTransaction.updateMany({
    where: { metadata: { path: ['order_id'], equals: orderId }, status: 'pending' },
    data: { status: 'failed', updatedAt: new Date() },
  });
  await tx.bid.updateMany({ where: { auctionId: order.auctionId }, data: { isWinning: false } });
  await tx.bid.update({ where: { id: nextBid.id }, data: { status: 'won', isWinning: true } });
  await tx.auction.update({ where: { id: order.auctionId }, data: { winnerId: nextBid.bidderId } });

  const offerExpiresAt = new Date(Date.now() + OFFER_WINDOW_HOURS * HOUR);
  const reassigned = await tx.order.update({
    where: { id: orderId },
    data: {
      buyerId: nextBid.bidderId,
      totalAmount: amount + config.deliveryFee,
      deliveryMethod: 'delivery',
      deliveryFee: config.deliveryFee,
      platformFee,
      sellerPayout: amount - platformFee,
      paymentStatus: 'pending',
      fulfillmentStatus: 'pending',
      shippingAddress: Prisma.JsonNull,
      paymentDueAt: null,
      offerExpiresAt,
      updatedAt: new Date(),
    },
  });

  return {
    order: transformOrder(reassigned),
    bidder: {
      id: nextBid.bidder.id,
      fullName: nextBid.bidder.fullName,
      phoneNumber: nextBid.bidder.phoneNumber,
      email: nextBid.bidder.email,
      amount,
    },
    gadgetTitle: order.auction?.gadget?.title || 'Item',
  };
};

type NextBidderOffer = Awaited<ReturnType<typeof reassignToNextBidder>>;

const notifySecondChance = async (result: NextBidderOffer) => {
  await notificationService.createNotification(
    result.bidder.id,
    'auction_won',
    'It can still be yours',
    `The winner didn't pay. You can buy the ${result.gadgetTitle} at your last bid of ₦${result.bidder.amount.toLocaleString()}. The offer ends in ${OFFER_WINDOW_HOURS} hours.`,
    {
      secondChance: true,
      orderId: result.order.id,
      orderNumber: result.order.order_number,
      auctionId: result.order.auction_id,
      amount: result.bidder.amount,
    },
    ['push', 'sms', 'email']
  );
  await notificationService.notifyAdmins(
    'bid_defaulted',
    'Second-place offer sent',
    `${result.bidder.fullName || 'Next bidder'} was offered order #${result.order.order_number} at ₦${result.bidder.amount.toLocaleString()}.`,
    {
      orderId: result.order.id,
      orderNumber: result.order.order_number,
      auctionId: result.order.auction_id,
      route: '/orders',
      secondPlaceBidder: result.bidder,
    }
  );
};

export const offerOrderToSecondPlaceBidder = async (orderId: string): Promise<SecondPlaceOfferResult> => {
  const result = await prisma.$transaction(tx => reassignToNextBidder(tx, orderId));
  await notifySecondChance(result);
  return { order: result.order, bidder: result.bidder };
};

/** Fulfillment steps before the item leaves the hub; the delivery address can still change. */
export const ADDRESS_EDITABLE_STATUSES: FulfillmentStatus[] = [
  'pending',
  'processing',
  'sent_to_backoffice',
  'received_by_backoffice',
];

export const updateShippingAddress = async (
  orderId: string,
  buyerId: string,
  address: ShippingAddress
): Promise<Order> => {
  // Before paying (checkout), or after paying until the item leaves the hub.
  const order = await prisma.order.updateMany({
    where: {
      id: orderId,
      buyerId,
      OR: [
        { paymentStatus: 'pending', fulfillmentStatus: 'pending' },
        {
          paymentStatus: 'paid',
          deliveryMethod: 'delivery',
          fulfillmentStatus: { in: ADDRESS_EDITABLE_STATUSES },
        },
      ],
    },
    data: {
      shippingAddress: address as any,
      updatedAt: new Date(),
    },
  });

  if (order.count === 0) {
    const exists = await prisma.order.findFirst({
      where: { id: orderId, buyerId },
      select: { id: true },
    });
    throw new Error(
      exists
        ? "This order has left the hub, so its address can't change now. Contact support if you need help."
        : 'Order not found or unauthorized'
    );
  }

  const updatedOrder = await prisma.order.findUnique({
    where: { id: orderId },
  });

  logger.info(`Shipping address updated for order: ${orderId}`);

  return transformOrder(updatedOrder);
};

/**
 * Confirm payment and process order
 */
export const confirmPayment = async (orderId: string): Promise<Order> => {
  const updated = await prisma.$transaction(async tx => {
    // Get order
    const order = await tx.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.paymentStatus === 'paid') {
      throw new Error('Order already paid');
    }

    if (order.deliveryMethod !== 'pickup' && !hasCompleteShippingAddress(order.shippingAddress)) {
      throw new Error(
        'Please add a shipping address before paying for this order'
      );
    }

    // Get winning bid
    const winningBid = await tx.bid.findFirst({
      where: {
        auctionId: order.auctionId!,
        bidderId: order.buyerId!,
        status: 'won',
      },
    });

    if (!winningBid) {
      throw new Error('Winning bid not found');
    }

    const winningBidWithHold = await tx.bid.findUnique({
      where: { id: winningBid.id },
      include: { bidHold: true },
    });

    const wallet = await tx.wallet.findUnique({
      where: { userId: order.buyerId! },
      include: {
        bidHolds: {
          where: { status: 'held' },
          select: { id: true, amount: true },
        },
      },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    if (wallet.isLocked) {
      throw new Error('Wallet is locked. Please contact support');
    }

    const readBalance = toNumber(wallet.balance);
    const orderTotal = toNumber(order.totalAmount);

    // Other active holds stay escrowed, so they must not be spendable here.
    // The winning bid's own hold is released by this payment, so it is excluded.
    const otherHeldAmount = wallet.bidHolds.reduce((sum, hold) => {
      if (winningBidWithHold?.bidHold && hold.id === winningBidWithHold.bidHold.id) {
        return sum;
      }
      return sum + toNumber(hold.amount);
    }, 0);

    const availableBalance = readBalance - otherHeldAmount;

    if (availableBalance < orderTotal) {
      throw new Error(
        `Insufficient available balance. You need ₦${orderTotal.toLocaleString()} to pay for this order.`
      );
    }

    const { balanceBefore, balanceAfter } = await applyBalanceDelta(
      tx,
      wallet.id,
      -orderTotal,
      `Insufficient available balance. You need ₦${orderTotal.toLocaleString()} to pay for this order.`
    );

    if (
      winningBidWithHold?.bidHold &&
      winningBidWithHold.bidHold.status === 'held'
    ) {
      await tx.bidHold.update({
        where: { id: winningBidWithHold.bidHold.id },
        data: { status: 'released', releasedAt: new Date() },
      });
    }

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        transactionType: 'purchase',
        amount: orderTotal,
        balanceBefore,
        balanceAfter,
        reference: `${order.orderNumber}-BUYER-PAYMENT`,
        description: `Wallet payment for order ${order.orderNumber}`,
        status: 'completed',
      },
    });

    // Update order payment status
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'paid',
        fulfillmentStatus: 'processing',
      },
    });

    logger.info(`Payment confirmed for order: ${order.orderNumber}`);

    return transformOrder(updatedOrder);
  });

  notificationService
    .notifyBackofficeOrderPaid(
      updated.id,
      updated.order_number,
      updated.total_amount
    )
    .catch(error => {
      logger.error(
        'Failed to notify backoffice about confirmed payment:',
        error
      );
    });
  import('../seller/sellerAlerts').then(a => a.notifySellerSold(updated.id)).catch(() => {});

  return updated;
};

/**
 * Update fulfillment status (seller action)
 */
export const updateFulfillmentStatus = async (
  orderId: string,
  sellerId: string,
  status: FulfillmentStatus,
  trackingNumber?: string
): Promise<Order> => {
  const validTransitions: Record<FulfillmentStatus, FulfillmentStatus[]> = {
    pending: ['processing', 'cancelled'],
    processing: ['sent_to_backoffice', 'cancelled'],
    sent_to_backoffice: [],
    received_by_backoffice: [],
    shipped: [],
    delivered: [],
    cancelled: [],
  };

  const updated = await prisma.$transaction(async tx => {
    // Get order
    const order = await tx.order.findFirst({
      where: { id: orderId, sellerId },
    });

    if (!order) {
      throw new Error('Order not found or unauthorized');
    }

    // Validate status transition
    const currentStatus = order.fulfillmentStatus as FulfillmentStatus;
    if (!validTransitions[currentStatus].includes(status)) {
      throw new Error(`Cannot transition from ${currentStatus} to ${status}`);
    }

    // Build update data
    const updateData: any = { fulfillmentStatus: status };
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: updateData,
    });

    // If cancelled, refund buyer
    if (status === 'cancelled' && order.paymentStatus === 'paid') {
      await refundBuyer(tx, order);
    }

    logger.info(`Order ${order.orderNumber} status updated to: ${status}`);

    return transformOrder(updatedOrder);
  });

  void buyerAlerts.notifyBuyerFulfillment(updated.id, status);

  if (status === 'sent_to_backoffice') {
    notificationService
      .notifyBackofficeIntake(updated.id, updated.order_number)
      .catch(err => {
        logger.error('Failed to notify backoffice intake:', err);
      });
  } else {
    notificationService
      .notifyBackofficeFulfillmentUpdated(
        updated.id,
        updated.order_number,
        fulfillmentStatusLabel(status)
      )
      .catch(err => {
        logger.error('Failed to notify backoffice fulfillment update:', err);
      });
  }

  return updated;
};

/**
 * Admin override for order payment / fulfillment / tracking.
 * Runs seller payout / buyer refund side-effects when status crosses those gates.
 */
export const adminUpdateOrder = async (
  orderId: string,
  updates: {
    payment_status?: string;
    fulfillment_status?: string;
    tracking_number?: string | null;
    payout_status?: string;
    payout_reference?: string | null;
  }
): Promise<Order> => {
  const allowedPayment = ['pending', 'paid', 'refunded'];
  // 'sending' only as "unchanged": the 6 pm payout run sets it (services/seller/payouts.service.ts).
  const allowedPayout = ['pending', 'ready', 'held', 'sending', 'paid'];
  const allowedFulfillment = [
    'pending',
    'processing',
    'sent_to_backoffice',
    'received_by_backoffice',
    'shipped',
    'delivered',
    'cancelled',
  ];

  if (
    updates.payment_status &&
    !allowedPayment.includes(updates.payment_status)
  ) {
    throw new Error('Invalid payment status');
  }
  if (
    updates.fulfillment_status &&
    !allowedFulfillment.includes(updates.fulfillment_status)
  ) {
    throw new Error('Invalid fulfillment status');
  }
  if (updates.payout_status && !allowedPayout.includes(updates.payout_status)) {
    throw new Error('Invalid payout status');
  }

  return prisma.$transaction(async tx => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new Error('Order not found');
    }

    const prevPayment = order.paymentStatus;
    const prevFulfillment = order.fulfillmentStatus as FulfillmentStatus;
    const nextPayment = updates.payment_status ?? prevPayment;
    const prevPayout = order.payoutStatus || 'pending';
    const nextPayout = updates.payout_status ?? prevPayout;

    // An order in a 6 pm payout is paid (or not) with that payout, never on its own here,
    // so it can't be paid twice. Edits that leave the payout as it is still go through.
    const payoutChanged =
      nextPayout !== prevPayout ||
      (updates.payout_reference !== undefined &&
        (updates.payout_reference || null) !== (order.payoutReference || null));
    if (order.payoutBatchId && payoutChanged) {
      const batch = await tx.sellerPayout.findUnique({
        where: { id: order.payoutBatchId },
        select: { reference: true, status: true },
      });
      const ref = batch?.reference ?? 'a seller payout';
      throw new Error(
        batch?.status === 'paid'
          ? `This order was paid out in ${ref}. Its payout can't be changed here.`
          : `This order is in payout ${ref}, which is on its way. Mark that payout paid or failed in Payouts › Seller payouts.`
      );
    }
    if (nextPayout === 'sending' && prevPayout !== 'sending') {
      throw new Error('Payouts are sent by the 6 pm run. Mark the order ready instead.');
    }
    let nextFulfillment =
      (updates.fulfillment_status as FulfillmentStatus) ?? prevFulfillment;

    // Marking paid should move unpaid orders into processing unless overridden.
    if (
      updates.payment_status === 'paid' &&
      prevPayment !== 'paid' &&
      !updates.fulfillment_status &&
      (prevFulfillment === 'pending' || !prevFulfillment)
    ) {
      nextFulfillment = 'processing';
    }

    // Nothing leaves the hub (shipped, or collected for pickup) until every hub check passed.
    if (
      ['shipped', 'delivered'].includes(nextFulfillment) &&
      AT_HUB_STATUSES.includes(prevFulfillment) &&
      !inspectionPassed(order.inspection)
    ) {
      throw new Error(
        `This order hasn't passed the hub check yet. Record the inspection with all ${HUB_INSPECTION_CHECKS.length} checks passed, then it can leave the hub.`
      );
    }

    if (
      nextPayout === 'paid' &&
      (nextPayment !== 'paid' || nextFulfillment !== 'delivered')
    ) {
      throw new Error(
        'Only paid and delivered orders can be marked as paid out'
      );
    }

    const data: Record<string, unknown> = {
      paymentStatus: nextPayment,
      fulfillmentStatus: nextFulfillment,
      payoutStatus: nextPayout,
      updatedAt: new Date(),
    };

    if (updates.tracking_number !== undefined) {
      data.trackingNumber = updates.tracking_number || null;
    }
    if (updates.payout_reference !== undefined) {
      data.payoutReference = updates.payout_reference || null;
    }
    if (updates.payout_status === 'paid' && prevPayout !== 'paid') {
      data.payoutPaidAt = new Date();
      if (!updates.payout_reference) {
        data.payoutReference = `MANUAL-${order.orderNumber}`;
      }
    } else if (
      updates.payout_status &&
      updates.payout_status !== 'paid' &&
      prevPayout === 'paid'
    ) {
      data.payoutPaidAt = null;
    }

    await tx.order.update({
      where: { id: orderId },
      data,
    });

    if (nextPayment === 'paid' && prevPayment !== 'paid') {
      const winningBid = await tx.bid.findFirst({
        where: {
          auctionId: order.auctionId!,
          bidderId: order.buyerId!,
          status: 'won',
        },
        include: { bidHold: true },
      });

      if (winningBid?.bidHold?.status === 'held') {
        const wallet = await tx.wallet.findUnique({
          where: { id: winningBid.bidHold.walletId! },
        });
        const balance = toNumber(wallet?.balance);
        const heldAmount = toNumber(winningBid.bidHold.amount);

        await tx.bidHold.update({
          where: { id: winningBid.bidHold.id },
          data: { status: 'released', releasedAt: new Date() },
        });

        if (wallet) {
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              transactionType: 'bid_release',
              amount: heldAmount,
              balanceBefore: balance,
              balanceAfter: balance,
              description: `Released winning bid commitment after manual payment for order ${order.orderNumber}`,
              status: 'completed',
            },
          });
        }
      }
    }

    // Delivered: the buyer now has CONFIRM_WINDOW_HOURS to confirm or report a problem.
    // The payout waits for that (or for the auto-confirm job) unless the buyer already confirmed.
    if (
      nextFulfillment === 'delivered' &&
      prevFulfillment !== 'delivered' &&
      (nextPayment === 'paid' || prevPayment === 'paid') &&
      !updates.payout_status &&
      order.buyerConfirmedAt
    ) {
      await markPayoutReady(tx, order);
    }

    // Credit seller once when admin marks payout paid
    if (nextPayout === 'paid' && prevPayout !== 'paid') {
      const existingPayout = await tx.walletTransaction.findFirst({
        where: {
          reference: order.orderNumber,
          transactionType: 'sale',
          status: 'completed',
        },
      });
      if (!existingPayout) {
        await creditSeller(tx, order);
      }
    }

    // Refund buyer once when cancelling a paid order, or marking payment refunded
    const cancelledPaid =
      nextFulfillment === 'cancelled' &&
      prevFulfillment !== 'cancelled' &&
      prevPayment === 'paid';
    const markedRefunded = nextPayment === 'refunded' && prevPayment === 'paid';

    if (cancelledPaid || markedRefunded) {
      const existingRefund = await tx.walletTransaction.findFirst({
        where: {
          reference: order.orderNumber,
          transactionType: 'refund',
          status: 'completed',
        },
      });
      if (!existingRefund) {
        await refundBuyer(tx, order);
      } else if (markedRefunded) {
        await tx.order.update({
          where: { id: orderId },
          data: { paymentStatus: 'refunded' },
        });
      }
    }

    const finalOrder = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
    });

    logger.info(
      `Admin updated order ${order.orderNumber}: payment ${prevPayment}->${finalOrder.paymentStatus}, fulfillment ${prevFulfillment}->${finalOrder.fulfillmentStatus}`
    );

    return transformOrder(finalOrder);
  }).then(result => {
    // Marked paid by our team: the seller hears it sold, same as any payment.
    if (updates.payment_status === 'paid' && result.payment_status === 'paid') {
      import('../seller/sellerAlerts').then(a => a.notifySellerSold(orderId)).catch(() => {});
    }
    return result;
  });
};

/**
 * Mark order as delivered (buyer confirmation)
 */
export const confirmDelivery = async (
  orderId: string,
  buyerId: string
): Promise<Order> => {
  const updated = await prisma.$transaction(async tx => {
    // Get order
    const order = await tx.order.findFirst({
      where: { id: orderId, buyerId },
    });

    if (!order) {
      throw new Error('Order not found or unauthorized');
    }

    const awaitingConfirmation = order.fulfillmentStatus === 'delivered' && !order.buyerConfirmedAt;
    if (order.fulfillmentStatus !== 'shipped' && !awaitingConfirmation) {
      throw new Error(
        order.fulfillmentStatus === 'delivered'
          ? 'You already confirmed this order.'
          : "You can confirm once it's on its way to you."
      );
    }
    const openDisputes = await tx.dispute.count({
      where: { orderId, OR: [{ status: { in: ['open', 'investigating'] } }, { outcome: 'refund' }] },
    });
    if (openDisputes > 0) {
      throw new Error("You've reported a problem with this order. We'll sort that out first.");
    }

    // Delivered (if the courier hadn't marked it yet) and confirmed by the buyer.
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: 'delivered', buyerConfirmedAt: new Date(), updatedAt: new Date() },
    });

    // Move payout into the admin payout queue
    await markPayoutReady(tx, order);

    logger.info(`Delivery confirmed for order: ${order.orderNumber}`);

    return transformOrder(updatedOrder);
  });

  notificationService
    .notifyBackofficeDeliveryConfirmed(updated.id, updated.order_number)
    .catch(error => {
      logger.error(
        'Failed to notify backoffice about delivery confirmation:',
        error
      );
    });

  return updated;
};

export const createDispute = async (
  orderId: string,
  userId: string,
  disputeType: string,
  description: string,
  evidence?: string[]
) => {
  const result = await prisma.$transaction(async tx => {
    const order = await tx.order.findFirst({
      where: {
        id: orderId,
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
      include: {
        disputes: {
          where: { status: { in: ['open', 'investigating'] } },
          select: { id: true },
        },
      },
    });

    if (!order) {
      throw new Error('Order not found or unauthorized');
    }

    if (order.disputes.length > 0) {
      throw new Error('This order already has an open dispute');
    }

    if (!['paid', 'completed'].includes(order.paymentStatus || '')) {
      throw new Error('Only paid orders can be disputed');
    }

    const dispute = await tx.dispute.create({
      data: {
        orderId,
        raisedBy: userId,
        disputeType,
        description,
        evidence: evidence?.length ? { photos: evidence.slice(0, 4) } : undefined,
        status: 'open',
      },
    });

    if ((order.payoutStatus || 'pending') !== 'paid') {
      await tx.order.update({
        where: { id: orderId },
        data: {
          payoutStatus: 'held',
          updatedAt: new Date(),
        },
      });
    }

    logger.info(`Dispute opened for order ${order.orderNumber}`);

    return {
      dispute: formatDispute(dispute),
      orderNumber: order.orderNumber,
    };
  });

  notificationService
    .notifyBackofficeDisputeOpened(
      orderId,
      result.orderNumber,
      result.dispute.id,
      readableActionLabel(disputeType)
    )
    .catch(error => {
      logger.error('Failed to notify backoffice about dispute:', error);
    });
  import('../seller/sellerAlerts').then(a => a.notifySellerCaseOpened(result.dispute.id)).catch(() => {});

  riskService.recordDisputeOpened(userId, result.dispute.id).catch(error => {
    logger.error('Failed to record dispute risk:', error);
  });

  return result.dispute;
};

/**
 * Mark seller payout ready after successful delivery.
 */
const markPayoutReady = async (tx: any, order: any): Promise<void> => {
  if ((order.payoutStatus || 'pending') !== 'pending') return;

  await tx.order.update({
    where: { id: order.id },
    data: {
      payoutStatus: 'ready',
      updatedAt: new Date(),
    },
  });
};

/**
 * Credit seller after admin marks payout paid.
 */
const creditSeller = async (tx: any, order: any): Promise<void> => {
  // Get seller wallet
  const wallet = await tx.wallet.findUnique({
    where: { userId: order.sellerId },
  });

  if (!wallet) {
    throw new Error('Seller wallet not found');
  }

  const sellerPayout = toNumber(order.sellerPayout);

  const { balanceBefore, balanceAfter } = await applyBalanceDelta(
    tx,
    wallet.id,
    sellerPayout
  );

  // Create transaction record
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      transactionType: 'sale',
      amount: sellerPayout,
      balanceBefore,
      balanceAfter,
      reference: order.orderNumber,
      description: `Payout for order ${order.orderNumber}`,
      status: 'completed',
    },
  });

  await tx.order.update({
    where: { id: order.id },
    data: {
      payoutStatus: 'paid',
      payoutPaidAt: new Date(),
      payoutReference: order.payoutReference || `MANUAL-${order.orderNumber}`,
      updatedAt: new Date(),
    },
  });

  logger.info(
    `Seller credited ₦${sellerPayout} for order ${order.orderNumber}`
  );
};

/**
 * Refund buyer for cancelled order
 */
const refundBuyer = async (tx: any, order: any): Promise<void> => {
  // Get buyer wallet
  const wallet = await tx.wallet.findUnique({
    where: { userId: order.buyerId },
  });

  if (!wallet) {
    throw new Error('Buyer wallet not found');
  }

  const totalAmount = toNumber(order.totalAmount);

  const { balanceBefore, balanceAfter } = await applyBalanceDelta(
    tx,
    wallet.id,
    totalAmount
  );

  // Update order payment status
  await tx.order.update({
    where: { id: order.id },
    data: { paymentStatus: 'refunded' },
  });

  // Create transaction record
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      transactionType: 'refund',
      amount: totalAmount,
      balanceBefore,
      balanceAfter,
      reference: order.orderNumber,
      description: `Refund for cancelled order ${order.orderNumber}`,
      status: 'completed',
    },
  });

  logger.info(`Buyer refunded ₦${totalAmount} for order ${order.orderNumber}`);
};

/**
 * Initialize Paystack payment for order
 */
export const initializeOrderPayment = async (
  orderId: string,
  buyerId: string,
  email: string,
  callbackUrl?: string,
  channel?: 'card' | 'bank_transfer' | 'ussd'
): Promise<PaystackInitializeResponse> => {
  // Get order
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId },
    include: {
      auction: {
        include: { gadget: true },
      },
    },
  });

  if (!order) {
    throw new Error('Order not found or unauthorized');
  }

  assertPayable(order);

  const amount = toNumber(order.totalAmount);
  const gadgetTitle = order.auction?.gadget?.title || 'Gadget';

  // Initialize Paystack payment
  const paymentResponse = await paystackService.initializePayment(
    email,
    amount,
    buyerId,
    {
      purpose: 'order_payment',
      order_id: orderId,
      order_number: order.orderNumber,
      gadget_title: gadgetTitle,
      callback_url: callbackUrl,
    },
    channel ? [channel] : undefined
  );

  // Create payment transaction record
  await prisma.paymentTransaction.create({
    data: {
      userId: buyerId,
      paymentGateway: 'paystack',
      gatewayReference: paymentResponse.reference,
      amount,
      currency: 'NGN',
      status: 'pending',
      metadata: {
        purpose: 'order_payment',
        order_id: orderId,
        order_number: order.orderNumber,
      },
    },
  });

  logger.info(`Order payment initialized: ${order.orderNumber} - ₦${amount}`);

  return paymentResponse;
};

/**
 * Verify and process order payment
 */
export const verifyOrderPayment = async (
  orderId: string,
  buyerId: string,
  reference: string
): Promise<Order> => {
  // The order must belong to the authenticated user.
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId },
    select: { id: true },
  });

  if (!order) {
    throw new Error('Order not found or unauthorized');
  }

  // Verify payment with Paystack
  const verification = await paystackService.verifyPayment(reference);

  if (!verification.status) {
    throw new Error('Payment verification failed');
  }

  // Check metadata
  const metadata = verification.metadata;
  if (metadata.order_id !== orderId) {
    throw new Error('Payment reference does not match order');
  }

  // Process the payment
  const paid = await processOrderPayment(
    orderId,
    reference,
    verification.amount,
    verification.gatewayResponse
  );
  // Keep the card for one-tap payments next time (lazy import: savedCard imports this file).
  import('../buyer/savedCard.service')
    .then(c => c.saveFromGateway(buyerId, verification.gatewayResponse))
    .catch(() => {});
  return paid;
};

/**
 * Process successful order payment (called by webhook or verification)
 */
export const processOrderPayment = async (
  orderId: string,
  reference: string,
  amount: number,
  gatewayResponse?: any
): Promise<Order> => {
  return prisma.$transaction(async tx => {
    // Get order
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        auction: {
          include: { gadget: true },
        },
        buyer: true,
        seller: true,
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.paymentStatus === 'paid') {
      logger.info(`Order ${order.orderNumber} already paid`);
      return transformOrder(order);
    }

    // Locate the payment transaction for this reference and validate it
    // against the CURRENT order state. This prevents a stale reference from
    // an earlier buyer (e.g. after second-place reassignment) from settling
    // the order, and catches amount drift between initialization and payment.
    const paymentTx = await tx.paymentTransaction.findFirst({
      where: { gatewayReference: reference },
    });

    if (paymentTx) {
      const txMetadata = (paymentTx.metadata as Record<string, unknown>) || {};

      if (txMetadata.purpose !== 'order_payment' || txMetadata.order_id !== orderId) {
        throw new Error('Payment reference does not match this order');
      }

      if (paymentTx.userId && paymentTx.userId !== order.buyerId) {
        throw new Error('Payment reference does not belong to the order buyer');
      }

      const currentTotal = toNumber(order.totalAmount);
      if (Math.abs(toNumber(paymentTx.amount) - currentTotal) > 0.01) {
        throw new Error(
          `Order payment amount mismatch for ${reference}: expected ${currentTotal}, got ${toNumber(paymentTx.amount)}`
        );
      }

      await tx.paymentTransaction.update({
        where: { id: paymentTx.id },
        data: {
          status: 'success',
          gatewayResponse: gatewayResponse || {},
          updatedAt: new Date(),
        },
      });
    } else {
      logger.warn(`No payment transaction found for reference: ${reference}`);
    }

    // Release any bid holds for this order (if they exist)
    const winningBid = await tx.bid.findFirst({
      where: {
        auctionId: order.auctionId!,
        bidderId: order.buyerId!,
        status: 'won',
      },
      include: { bidHold: true },
    });

    if (winningBid?.bidHold && winningBid.bidHold.status === 'held') {
      const wallet = await tx.wallet.findUnique({
        where: { userId: order.buyerId! },
      });
      const balance = toNumber(wallet?.balance);
      const heldAmount = toNumber(winningBid.bidHold.amount);

      // Release the hold since payment was made via Paystack.
      // Bid holds reserve available balance; they do not deduct wallet balance.
      await tx.bidHold.update({
        where: { id: winningBid.bidHold.id },
        data: {
          status: 'released',
          releasedAt: new Date(),
        },
      });

      if (wallet) {
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            transactionType: 'bid_release',
            amount: heldAmount,
            balanceBefore: balance,
            balanceAfter: balance,
            description: `Released winning bid hold after external payment for order ${order.orderNumber}`,
            status: 'completed',
          },
        });

        logger.info(
          `Released bid hold of ₦${heldAmount} for order ${order.orderNumber}`
        );
      }
    }

    // Update order status (use 'paid' as per DB constraint)
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'paid',
        fulfillmentStatus: 'processing',
        updatedAt: new Date(),
      },
    });

    logger.info(`Order payment completed: ${order.orderNumber} - ₦${amount}`);

    // Send notifications (outside transaction)
    setImmediate(async () => {
      try {
        // Notify buyer
        await notificationService.createNotification(
          order.buyerId!,
          'payment_received',
          'Payment Successful!',
          `Your payment of ₦${amount.toLocaleString()} for order #${order.orderNumber} was successful. The seller will ship your item soon.`,
          { orderId, orderNumber: order.orderNumber, amount },
          ['push']
        );

        // Tell the seller it sold (once per order). Lazy import: the alerts read this file.
        await import('../seller/sellerAlerts').then(a => a.notifySellerSold(orderId));

        await notificationService.notifyBackofficeOrderPaid(
          orderId,
          order.orderNumber,
          amount
        );
      } catch (err) {
        logger.error('Failed to send payment notifications:', err);
      }
    });

    return transformOrder(updatedOrder);
  });
};

/**
 * Expire unpaid winner orders after their payment window.
 * The ₦1,000 bid commitment is kept and the miss is recorded; after
 * MISSED_PAYMENT_LIMIT misses in a year, bidding pauses for BIDDING_PAUSE_DAYS.
 * The order then goes to the next highest bidder as a second-chance offer.
 */
export const expirePendingOrders = async (): Promise<number> => {
  const now = new Date();
  const legacyCutoff = new Date(now.getTime() - ORDER_PAYMENT_EXPIRY_HOURS * HOUR);

  const expiredOrders = await prisma.order.findMany({
    where: {
      paymentStatus: 'pending',
      fulfillmentStatus: 'pending',
      offerExpiresAt: null,
      OR: [
        { paymentDueAt: { lte: now } },
        { paymentDueAt: null, createdAt: { lte: legacyCutoff } },
      ],
    },
    select: { id: true, orderNumber: true, auctionId: true, buyerId: true, totalAmount: true },
    take: 50,
  });

  let expiredCount = 0;

  for (const order of expiredOrders) {
    try {
      const result = await prisma.$transaction(async tx => {
        const freshOrder = await tx.order.findFirst({
          where: { id: order.id, paymentStatus: 'pending', fulfillmentStatus: 'pending', offerExpiresAt: null },
        });
        if (!freshOrder || !order.buyerId) return;

        const auction = order.auctionId
          ? await tx.auction.findUnique({ where: { id: order.auctionId }, include: { gadget: true } })
          : null;

        let forfeitedAmount = 0;
        let winningAmount = toNumber(freshOrder.totalAmount) - toNumber(freshOrder.deliveryFee);

        if (order.auctionId) {
          const winningBid = await tx.bid.findFirst({
            where: { auctionId: order.auctionId, bidderId: order.buyerId, status: 'won' },
            include: { bidHold: true },
          });
          if (winningBid) winningAmount = toNumber(winningBid.amount);

          // Keep the bid commitment (the deterrent the buyer agreed to when bidding).
          if (winningBid?.bidHold?.status === 'held') {
            const heldAmount = toNumber(winningBid.bidHold.amount);
            forfeitedAmount = heldAmount;
            await tx.bidHold.update({
              where: { id: winningBid.bidHold.id },
              data: { status: 'charged', releasedAt: new Date() },
            });
            if (winningBid.bidHold.walletId) {
              const { balanceBefore, balanceAfter } = await applyBalanceDelta(tx, winningBid.bidHold.walletId, -heldAmount);
              await tx.walletTransaction.create({
                data: {
                  walletId: winningBid.bidHold.walletId,
                  transactionType: 'fee',
                  amount: heldAmount,
                  balanceBefore,
                  balanceAfter,
                  description: `Bid commitment kept for unpaid order ${order.orderNumber}`,
                  status: 'completed',
                },
              });
            }
          }

          // The buyer is out of this auction; the next bidder gets the offer.
          await tx.bid.updateMany({
            where: { auctionId: order.auctionId, bidderId: order.buyerId },
            data: { status: 'withdrawn', isWinning: false },
          });
        }

        const missed = await tx.missedPayment.create({
          data: {
            userId: order.buyerId,
            orderId: order.id,
            orderNumber: order.orderNumber,
            auctionId: order.auctionId,
            categoryId: auction?.gadget?.categoryId ?? null,
            gadgetTitle: auction?.gadget?.title || 'Item',
            gadgetImage: auction?.gadget?.images?.[0] ?? null,
            winningBid: winningAmount,
            forfeitedAmount,
            auctionEndedAt: auction?.endTime ?? null,
          },
        });

        const since = new Date(now.getTime() - MISSED_PAYMENT_LOOKBACK_DAYS * 24 * HOUR);
        const strikes = await tx.missedPayment.count({
          where: { userId: order.buyerId, createdAt: { gte: since } },
        });
        let pausedUntil: Date | null = null;
        if (strikes >= MISSED_PAYMENT_LIMIT) {
          pausedUntil = new Date(now.getTime() + BIDDING_PAUSE_DAYS * 24 * HOUR);
          await tx.user.update({ where: { id: order.buyerId }, data: { biddingPausedUntil: pausedUntil } });
        }

        // Nobody else bid: the order ends here.
        const nextBid = order.auctionId
          ? await tx.bid.findFirst({
              where: { auctionId: order.auctionId, bidderId: { not: order.buyerId }, status: { not: 'withdrawn' } },
              select: { id: true },
            })
          : null;
        let offer: NextBidderOffer | null = null;
        if (nextBid) {
          offer = await reassignToNextBidder(tx, order.id);
        } else {
          await tx.order.update({
            where: { id: order.id },
            data: { fulfillmentStatus: 'cancelled', updatedAt: new Date() },
          });
        }

        return {
          missedId: missed.id,
          gadgetTitle: auction?.gadget?.title || 'Item',
          forfeitedAmount,
          strikes,
          pausedUntil,
          hasNextBidder: !!nextBid,
          offer,
        };
      });
      if (!result) continue;

      expiredCount += 1;
      logger.info(`Expired unpaid order ${order.orderNumber} (miss ${result.strikes})`);

      riskService.recordMissedBidPayment(order.buyerId, order.id, order.orderNumber).catch(error => {
        logger.error('Failed to record missed bid payment risk:', error);
      });

      const pauseNote = result.pausedUntil
        ? ` That's ${MISSED_PAYMENT_LIMIT} missed payments, so bidding is paused for ${BIDDING_PAUSE_DAYS} days.`
        : '';
      notificationService
        .createNotification(
          order.buyerId!,
          'bid_defaulted',
          'Your time to pay ran out',
          `We didn't get payment for the ${result.gadgetTitle}, so it's been offered to the next highest bidder.${pauseNote}`,
          { missedPaymentId: result.missedId, orderNumber: order.orderNumber },
          ['push']
        )
        .catch(error => logger.error('Failed to notify defaulted buyer:', error));

      notificationService
        .notifyAdmins(
          'bid_defaulted',
          'Winning bidder missed payment',
          `Order #${order.orderNumber} wasn't paid in time. ₦${result.forfeitedAmount.toLocaleString()} commitment kept. ${
            result.hasNextBidder ? 'Offering it to the next bidder.' : 'No other bidder, so the order is cancelled.'
          }`,
          { orderId: order.id, orderNumber: order.orderNumber, auctionId: order.auctionId, route: '/orders' }
        )
        .catch(error => logger.error('Failed to notify admins about bid default:', error));

      if (result.offer) {
        notifySecondChance(result.offer).catch(error => {
          logger.error('Failed to send second-place offer alerts:', error);
        });
      }
    } catch (error) {
      logger.error(`Failed to expire order ${order.orderNumber}:`, error);
    }
  }

  return expiredCount;
};

/**
 * Get order statistics for user
 */
export const getOrderStats = async (
  userId: string
): Promise<{
  totalPurchases: number;
  totalSales: number;
  pendingOrders: number;
  completedOrders: number;
}> => {
  const [totalPurchases, totalSales, pendingOrders, completedOrders] =
    await Promise.all([
      prisma.order.count({ where: { buyerId: userId } }),
      prisma.order.count({ where: { sellerId: userId } }),
      prisma.order.count({
        where: {
          OR: [{ buyerId: userId }, { sellerId: userId }],
          fulfillmentStatus: {
            in: [
              'pending',
              'processing',
              'sent_to_backoffice',
              'received_by_backoffice',
              'shipped',
            ],
          },
        },
      }),
      prisma.order.count({
        where: {
          OR: [{ buyerId: userId }, { sellerId: userId }],
          fulfillmentStatus: 'delivered',
        },
      }),
    ]);

  return {
    totalPurchases,
    totalSales,
    pendingOrders,
    completedOrders,
  };
};

/**
 * Format order with details from Prisma result
 */
const formatOrderWithDetails = (order: any): OrderWithDetails => {
  return {
    id: order.id,
    auction_id: order.auctionId,
    buyer_id: order.buyerId,
    seller_id: order.sellerId,
    order_number: order.orderNumber,
    total_amount: toNumber(order.totalAmount),
    delivery_fee: toNumber(order.deliveryFee),
    item_amount: toNumber(order.totalAmount) - toNumber(order.deliveryFee),
    delivery_method: order.deliveryMethod ?? 'delivery',
    platform_fee: toNumber(order.platformFee),
    seller_payout: toNumber(order.sellerPayout),
    payout_status: order.payoutStatus,
    payout_paid_at: order.payoutPaidAt?.toISOString(),
    payout_reference: order.payoutReference,
    payment_status: order.paymentStatus,
    fulfillment_status: order.fulfillmentStatus,
    shipping_address: order.shippingAddress,
    tracking_number: order.trackingNumber,
    disputes: order.disputes?.map(formatDispute),
    open_dispute: order.disputes?.some((d: any) => ['open', 'investigating'].includes(d.status)),
    refund_pending: order.paymentStatus !== 'refunded' && !!order.disputes?.some((d: any) => d.outcome === 'refund'),
    created_at: order.createdAt?.toISOString(),
    updated_at: order.updatedAt?.toISOString(),
    payment_due_at: paymentDueOf(order)?.toISOString(),
    offer_expires_at: order.offerExpiresAt?.toISOString() ?? null,
    buyer_confirmed_at: order.buyerConfirmedAt?.toISOString() ?? null,
    /** Delivered but not confirmed: we confirm for the buyer at this time. */
    confirm_by:
      order.fulfillmentStatus === 'delivered' && !order.buyerConfirmedAt && deliveredAtOf(order)
        ? new Date(deliveredAtOf(order)!.getTime() + CONFIRM_WINDOW_HOURS * HOUR).toISOString()
        : null,
    /** Paid, not at the hub yet: the seller drops it off by this time. */
    dropoff_due_at: dropoffDueOf(order)?.toISOString() ?? null,
    /** Hub check score ("7 of 7 checks"), never who did it. */
    inspection: inspectionSummary(order.inspection),
    events: order.events?.map((e: any) => ({
      kind: e.kind,
      status: e.status,
      at: e.createdAt?.toISOString(),
    })),
    auction: order.auction
      ? {
          id: order.auction.id,
          starting_price: toNumber(order.auction.startingPrice),
          current_price: toNumber(order.auction.currentPrice),
          end_time: order.auction.endTime?.toISOString(),
          total_bids: order.auction.totalBids ?? 0,
        }
      : undefined,
    gadget: order.auction?.gadget
      ? {
          id: order.auction.gadget.id,
          title: order.auction.gadget.title,
          description: order.auction.gadget.description,
          brand: order.auction.gadget.brand,
          model: order.auction.gadget.model,
          condition: order.auction.gadget.condition,
          images: order.auction.gadget.images,
          category_id: order.auction.gadget.categoryId ?? null,
        }
      : undefined,
    buyer: order.buyer
      ? {
          id: order.buyer.id,
          full_name: order.buyer.fullName,
          phone_number: order.buyer.phoneNumber,
        }
      : undefined,
    seller: order.seller
      ? {
          id: order.seller.id,
          full_name: order.seller.fullName,
          phone_number: order.seller.phoneNumber,
        }
      : undefined,
  } as unknown as OrderWithDetails;
};

/**
 * Buyer picks home delivery (flat fee) or free pickup at the hub. Only before paying.
 */
export const setDeliveryMethod = async (
  orderId: string,
  buyerId: string,
  method: 'delivery' | 'pickup'
): Promise<Order> => {
  const order = await prisma.order.findFirst({ where: { id: orderId, buyerId } });
  if (!order) throw new Error('Order not found or unauthorized');
  if (order.paymentStatus !== 'pending') throw new Error('This order is already paid');
  const itemAmount = toNumber(order.totalAmount) - toNumber(order.deliveryFee);
  const deliveryFee = method === 'pickup' ? 0 : config.deliveryFee;
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      deliveryMethod: method,
      deliveryFee,
      totalAmount: itemAmount + deliveryFee,
      updatedAt: new Date(),
    },
  });
  return transformOrder(updated);
};

/* ---------------- Buyer order page extras ---------------- */

const titleCase = (s: string) => s.trim().charAt(0).toUpperCase() + s.trim().slice(1).toLowerCase();

/** How the buyer paid, e.g. "Visa ending 4242", "Bank transfer", "Wallet". Null when unknown. */
export const paymentMethodLabel = async (
  orderId: string,
  orderNumber: string
): Promise<string | null> => {
  const tx = await prisma.paymentTransaction.findFirst({
    where: { status: 'success', metadata: { path: ['order_id'], equals: orderId } },
    orderBy: { updatedAt: 'desc' },
  });
  if (tx) {
    const raw = (tx.gatewayResponse ?? {}) as Record<string, any>;
    const gr = (raw.data && typeof raw.data === 'object' ? raw.data : raw) as Record<string, any>;
    const auth = gr.authorization ?? gr.cardDetails ?? {};
    const last4 = auth.last4 ?? auth.last_4digits;
    const brand = auth.card_type ?? auth.cardType ?? auth.brand;
    const channel = String(gr.channel ?? gr.paymentMethod ?? tx.paymentMethod ?? '').toLowerCase();
    if (last4) return `${brand ? titleCase(String(brand)) : 'Card'} ending ${last4}`;
    if (channel.includes('transfer')) return 'Bank transfer';
    if (channel.includes('ussd')) return 'USSD';
    if (channel.includes('card')) return 'Card';
    return null;
  }
  const walletPayment = await prisma.walletTransaction.findFirst({
    where: { reference: `${orderNumber}-BUYER-PAYMENT`, transactionType: 'purchase' },
    select: { id: true },
  });
  return walletPayment ? 'Wallet' : null;
};

/** Emails the buyer a receipt for a paid order. */
export const emailReceipt = async (orderId: string, buyerId: string): Promise<{ email: string }> => {
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId },
    include: {
      auction: { include: { gadget: { select: { title: true } } } },
      buyer: { select: { email: true } },
      events: { where: { kind: 'payment', status: 'paid' }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!order) throw new Error('Order not found or unauthorized');
  if (order.paymentStatus !== 'paid') throw new Error("There's no receipt yet. It's ready once you've paid.");
  const email = order.buyer?.email;
  if (!email) {
    throw new Error('Add an email to your account first, then try again.');
  }

  const sent = await emailService.sendOrderReceiptEmail(email, {
    orderNumber: order.orderNumber,
    itemTitle: order.auction?.gadget?.title ?? 'Your gadget',
    itemAmount: toNumber(order.totalAmount) - toNumber(order.deliveryFee),
    deliveryFee: toNumber(order.deliveryFee),
    deliveryMethod: order.deliveryMethod === 'pickup' ? 'pickup' : 'delivery',
    total: toNumber(order.totalAmount),
    paidWith: await paymentMethodLabel(order.id, order.orderNumber),
    paidAt: order.events[0]?.createdAt ?? order.updatedAt ?? null,
  });
  if (!sent) throw new Error("We couldn't send the receipt just now. Try again in a minute.");
  return { email };
};

/* ---------------- Paying: checks, bank transfer, USSD ---------------- */

/** Throws a plain-words reason when the order can't be paid right now. */
const assertPayable = (order: any) => {
  if (order.paymentStatus === 'paid') throw new Error('This order is already paid.');
  if (order.fulfillmentStatus === 'cancelled') throw new Error('This order was cancelled, so it can\'t be paid.');
  if (order.offerExpiresAt) throw new Error('Accept the offer first, then pay.');
  const due = paymentDueOf(order);
  if (due && due.getTime() <= Date.now()) throw new Error('The time to pay for this order has passed.');
  if (order.deliveryMethod !== 'pickup' && !hasCompleteShippingAddress(order.shippingAddress)) {
    throw new Error('Add a delivery address before paying for this order.');
  }
};

const loadPayableOrder = async (orderId: string, buyerId: string) => {
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId },
    include: { auction: { include: { gadget: { select: { title: true } } } } },
  });
  if (!order) throw new Error('Order not found or unauthorized');
  assertPayable(order);
  return order;
};

const recordPendingCharge = (buyerId: string, order: any, reference: string, method: string) =>
  prisma.paymentTransaction.create({
    data: {
      userId: buyerId,
      paymentGateway: 'paystack',
      gatewayReference: reference,
      amount: toNumber(order.totalAmount),
      currency: 'NGN',
      paymentMethod: method,
      status: 'pending',
      metadata: { purpose: 'order_payment', order_id: order.id, order_number: order.orderNumber },
    },
  });

const chargeMetadata = (buyerId: string, order: any) => ({
  user_id: buyerId,
  purpose: 'order_payment',
  order_id: order.id,
  order_number: order.orderNumber,
  gadget_title: order.auction?.gadget?.title || 'Gadget',
});

/** A one-time account number to pay this order by bank transfer. */
export const startBankTransfer = async (orderId: string, buyerId: string, email: string) => {
  const order = await loadPayableOrder(orderId, buyerId);
  // The account never outlives the payment window.
  const due = paymentDueOf(order)!;
  const expiresAt = new Date(Math.min(Date.now() + TRANSFER_ACCOUNT_MINUTES * 60_000, due.getTime()));
  const charge = await paystackService.chargeBankTransfer(
    email,
    toNumber(order.totalAmount),
    expiresAt,
    chargeMetadata(buyerId, order)
  );
  await recordPendingCharge(buyerId, order, charge.reference, 'bank_transfer');
  logger.info(`Bank transfer account issued for ${order.orderNumber}`);
  return {
    reference: charge.reference,
    bank_name: charge.bankName,
    account_number: charge.accountNumber,
    account_name: charge.accountName,
    amount: toNumber(order.totalAmount),
    expires_at: charge.expiresAt,
  };
};

/** A USSD code to pay this order from the buyer's bank. */
export const startUssd = async (
  orderId: string,
  buyerId: string,
  email: string,
  bank: paystackService.UssdBankCode
) => {
  if (!(bank in paystackService.USSD_BANKS)) throw new Error('Choose GTBank, Zenith Bank or UBA.');
  const order = await loadPayableOrder(orderId, buyerId);
  const charge = await paystackService.chargeUssd(email, toNumber(order.totalAmount), bank, chargeMetadata(buyerId, order));
  await recordPendingCharge(buyerId, order, charge.reference, 'ussd');
  logger.info(`USSD code issued for ${order.orderNumber} (${bank})`);
  return {
    reference: charge.reference,
    ussd_code: charge.ussdCode,
    bank: paystackService.USSD_BANKS[bank],
    amount: toNumber(order.totalAmount),
  };
};

/**
 * Has the money for this reference arrived? Settles the order when it has.
 * "pending" is normal for transfers and USSD until the bank confirms.
 */
export const checkPayment = async (
  orderId: string,
  buyerId: string,
  reference: string
): Promise<{ state: 'paid' | 'pending' | 'failed' }> => {
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId },
    select: { id: true, paymentStatus: true },
  });
  if (!order) throw new Error('Order not found or unauthorized');
  if (order.paymentStatus === 'paid') return { state: 'paid' };

  const tx = await prisma.paymentTransaction.findFirst({
    where: { gatewayReference: reference, userId: buyerId, metadata: { path: ['order_id'], equals: orderId } },
    select: { id: true },
  });
  if (!tx) throw new Error("We couldn't find that payment. Start again.");

  const result = await paystackService.paymentState(reference);
  if (result.state === 'paid') {
    await processOrderPayment(orderId, reference, result.amount, result.gatewayResponse);
    return { state: 'paid' };
  }
  return { state: result.state };
};

/* ---------------- Second-chance offers ---------------- */

/** The next bidder takes the offer: they now have a fresh payment window. */
export const acceptSecondChance = async (orderId: string, buyerId: string): Promise<Order> => {
  const updated = await prisma.order.updateMany({
    where: { id: orderId, buyerId, paymentStatus: 'pending', offerExpiresAt: { gt: new Date() } },
    data: {
      offerExpiresAt: null,
      paymentDueAt: new Date(Date.now() + ORDER_PAYMENT_EXPIRY_HOURS * HOUR),
      updatedAt: new Date(),
    },
  });
  if (updated.count === 0) throw new Error('This offer has ended.');
  logger.info(`Second-chance offer accepted for order ${orderId}`);
  return transformOrder(await prisma.order.findUniqueOrThrow({ where: { id: orderId } }));
};

/**
 * The next bidder says no (or lets the offer run out). It's free and doesn't count as a
 * missed payment; the offer moves on to the bidder after them, or the order is cancelled.
 */
const passOnOffer = async (orderId: string, buyerId: string, reason: 'declined' | 'expired') => {
  const offer = await prisma.$transaction(async tx => {
    const order = await tx.order.findFirst({
      where: { id: orderId, buyerId, paymentStatus: 'pending', NOT: { offerExpiresAt: null } },
    });
    if (!order) return null;
    if (order.auctionId) {
      await tx.bid.updateMany({
        where: { auctionId: order.auctionId, bidderId: buyerId },
        data: { status: 'withdrawn', isWinning: false },
      });
    }
    const next = order.auctionId
      ? await tx.bid.findFirst({
          where: { auctionId: order.auctionId, bidderId: { not: buyerId }, status: { not: 'withdrawn' } },
          select: { id: true },
        })
      : null;
    if (next) return reassignToNextBidder(tx, orderId);
    await tx.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: 'cancelled', offerExpiresAt: null, updatedAt: new Date() },
    });
    return 'cancelled' as const;
  });
  if (!offer) return false;
  logger.info(`Second-chance offer ${reason} for order ${orderId}`);
  if (offer === 'cancelled') {
    notificationService
      .notifyAdmins('bid_defaulted', 'No bidder left', `Every remaining bidder passed on order ${orderId}; it was cancelled.`, {
        orderId,
        route: '/orders',
      })
      .catch(() => {});
  } else {
    notifySecondChance(offer).catch(err => logger.error('Failed to send second-place offer alerts:', err));
  }
  return true;
};

export const declineSecondChance = async (orderId: string, buyerId: string) => {
  if (!(await passOnOffer(orderId, buyerId, 'declined'))) throw new Error('This offer has already ended.');
  return { declined: true };
};

/** Offers nobody answered in time move on (job). */
export const expireSecondChanceOffers = async (): Promise<number> => {
  const stale = await prisma.order.findMany({
    where: { paymentStatus: 'pending', offerExpiresAt: { lte: new Date() } },
    select: { id: true, buyerId: true },
    take: 50,
  });
  let n = 0;
  for (const o of stale) {
    if (o.buyerId && (await passOnOffer(o.id, o.buyerId, 'expired').catch(() => false))) n += 1;
  }
  return n;
};

/* ---------------- After delivery: confirm or we confirm for you ---------------- */

/** Delivered orders the buyer hasn't confirmed get confirmed CONFIRM_WINDOW_HOURS after delivery (job). */
export const autoConfirmDeliveries = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - CONFIRM_WINDOW_HOURS * HOUR);
  const due = await prisma.order.findMany({
    where: {
      fulfillmentStatus: 'delivered',
      buyerConfirmedAt: null,
      // Not while a case is open, nor after a refund was decided (the item is coming back).
      disputes: { none: { OR: [{ status: { in: ['open', 'investigating'] } }, { outcome: 'refund' }] } },
      events: { some: { kind: 'fulfillment', status: 'delivered', createdAt: { lte: cutoff } } },
    },
    take: 50,
  });
  for (const order of due) {
    await prisma.$transaction(async tx => {
      await tx.order.update({ where: { id: order.id }, data: { buyerConfirmedAt: new Date(), updatedAt: new Date() } });
      await markPayoutReady(tx, order);
    });
    logger.info(`Auto-confirmed delivery for order ${order.orderNumber}`);
    if (order.buyerId) {
      notificationService
        .createNotification(
          order.buyerId,
          'order_delivered',
          'We confirmed your delivery',
          `It's been ${CONFIRM_WINDOW_HOURS} hours since order ${order.orderNumber} was delivered, so we've paid the seller. Need help? Contact support.`,
          { orderId: order.id, orderNumber: order.orderNumber },
          ['push']
        )
        .catch(() => {});
    }
  }
  return due.length;
};
