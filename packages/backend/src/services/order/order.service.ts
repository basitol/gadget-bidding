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
  PLATFORM_FEE_PERCENTAGE,
  PaystackInitializeResponse,
} from '@gadget-bidding/shared';
import * as paystackService from '../payment/paystack.service';
import * as notificationService from '../notification/notification.service';
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

const ORDER_PAYMENT_EXPIRY_HOURS = Number(
  process.env.ORDER_PAYMENT_EXPIRY_HOURS || BID_PAYMENT_DEADLINE_HOURS
);

const formatDispute = (dispute: any) => ({
  id: dispute.id,
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
  open_dispute: order.disputes?.some((d: any) =>
    ['open', 'investigating'].includes(d.status)
  ),
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

    // Calculate fees
    const platformFee = (finalPrice * PLATFORM_FEE_PERCENTAGE) / 100;
    const sellerPayout = finalPrice - platformFee;

    // Create order
    const order = await tx.order.create({
      data: {
        auctionId,
        buyerId: winnerId,
        sellerId: auction.gadget?.sellerId,
        orderNumber: generateOrderNumber(),
        totalAmount: finalPrice,
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

const hasCompleteShippingAddress = (address: unknown): boolean => {
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

export const offerOrderToSecondPlaceBidder = async (
  orderId: string
): Promise<SecondPlaceOfferResult> => {
  const result = await prisma.$transaction(async tx => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        auction: {
          include: { gadget: true },
        },
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (!order.auctionId || !order.buyerId) {
      throw new Error('Order is missing auction or buyer details');
    }

    if (order.paymentStatus === 'paid') {
      throw new Error('Paid orders cannot be reassigned');
    }

    const secondBid = await tx.bid.findFirst({
      where: {
        auctionId: order.auctionId,
        bidderId: { not: order.buyerId },
      },
      include: {
        bidder: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            email: true,
          },
        },
      },
      orderBy: [{ amount: 'desc' }, { bidTime: 'asc' }],
    });

    if (!secondBid?.bidderId || !secondBid.bidder) {
      throw new Error('No second-place bidder is available');
    }

    const secondAmount = toNumber(secondBid.amount);
    const platformFee = (secondAmount * PLATFORM_FEE_PERCENTAGE) / 100;
    const sellerPayout = secondAmount - platformFee;

    await tx.bid.updateMany({
      where: { auctionId: order.auctionId },
      data: { isWinning: false },
    });

    await tx.bid.update({
      where: { id: secondBid.id },
      data: { status: 'won', isWinning: true },
    });

    await tx.auction.update({
      where: { id: order.auctionId },
      data: { winnerId: secondBid.bidderId },
    });

    const reassignedOrder = await tx.order.update({
      where: { id: orderId },
      data: {
        buyerId: secondBid.bidderId,
        totalAmount: secondAmount,
        platformFee,
        sellerPayout,
        paymentStatus: 'pending',
        fulfillmentStatus: 'pending',
        shippingAddress: Prisma.JsonNull,
        updatedAt: new Date(),
      },
    });

    return {
      order: transformOrder(reassignedOrder),
      bidder: {
        id: secondBid.bidder.id,
        fullName: secondBid.bidder.fullName,
        phoneNumber: secondBid.bidder.phoneNumber,
        email: secondBid.bidder.email,
        amount: secondAmount,
      },
      gadgetTitle: order.auction?.gadget?.title || 'Item',
    };
  });

  await notificationService.createNotification(
    result.bidder.id,
    'auction_won',
    'Second chance to buy',
    `The winning bidder missed payment for "${result.gadgetTitle}". You are next in line at ₦${result.bidder.amount.toLocaleString()}. Complete payment within ${BID_PAYMENT_DEADLINE_HOURS} hours to secure it.`,
    {
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
    `${result.bidder.fullName || 'Second-place bidder'} was offered order #${result.order.order_number} at ₦${result.bidder.amount.toLocaleString()}.`,
    {
      orderId: result.order.id,
      orderNumber: result.order.order_number,
      auctionId: result.order.auction_id,
      route: '/orders',
      secondPlaceBidder: result.bidder,
    }
  );

  return { order: result.order, bidder: result.bidder };
};

/**
 * Update shipping address
 */
export const updateShippingAddress = async (
  orderId: string,
  buyerId: string,
  address: ShippingAddress
): Promise<Order> => {
  const order = await prisma.order.updateMany({
    where: {
      id: orderId,
      buyerId,
      paymentStatus: 'pending',
      fulfillmentStatus: 'pending',
    },
    data: {
      shippingAddress: address as any,
    },
  });

  if (order.count === 0) {
    throw new Error(
      'Order not found, unauthorized, or payment already started'
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

    if (!hasCompleteShippingAddress(order.shippingAddress)) {
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
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    if (wallet.isLocked) {
      throw new Error('Wallet is locked. Please contact support');
    }

    const balanceBefore = toNumber(wallet.balance);
    const orderTotal = toNumber(order.totalAmount);

    if (balanceBefore < orderTotal) {
      throw new Error(
        `Insufficient wallet balance. You need ₦${orderTotal.toLocaleString()} to pay for this order.`
      );
    }

    const balanceAfter = balanceBefore - orderTotal;

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: balanceAfter },
    });

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
  const allowedPayout = ['pending', 'ready', 'held', 'paid'];
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

    // Move delivered paid orders into the payout queue unless admin overrides it
    if (
      nextFulfillment === 'delivered' &&
      prevFulfillment !== 'delivered' &&
      (nextPayment === 'paid' || prevPayment === 'paid') &&
      !updates.payout_status
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

    if (order.fulfillmentStatus !== 'shipped') {
      throw new Error('Order must be shipped before confirming delivery');
    }

    // Update to delivered
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: 'delivered' },
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
  description: string
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

  const balanceBefore = toNumber(wallet.balance);
  const sellerPayout = toNumber(order.sellerPayout);
  const balanceAfter = balanceBefore + sellerPayout;

  // Update wallet balance
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: balanceAfter },
  });

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

  const balanceBefore = toNumber(wallet.balance);
  const totalAmount = toNumber(order.totalAmount);
  const balanceAfter = balanceBefore + totalAmount;

  // Update wallet balance
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: balanceAfter },
  });

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
  callbackUrl?: string
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

  if (order.paymentStatus === 'paid') {
    throw new Error('Order already paid');
  }

  if (!hasCompleteShippingAddress(order.shippingAddress)) {
    throw new Error(
      'Please add a shipping address before paying for this order'
    );
  }

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
    }
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
  reference: string
): Promise<Order> => {
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
  return processOrderPayment(
    orderId,
    reference,
    verification.amount,
    verification.gatewayResponse
  );
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

    // Update payment transaction (use 'success' as per DB constraint)
    await tx.paymentTransaction.updateMany({
      where: { gatewayReference: reference },
      data: {
        status: 'success',
        gatewayResponse: gatewayResponse || {},
        updatedAt: new Date(),
      },
    });

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

        // Notify seller
        await notificationService.notifyPaymentReceived(
          order.sellerId!,
          order.orderNumber,
          amount
        );

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
 * Expire unpaid winner orders after the configured payment window.
 * This prevents stuck pending orders from holding buyer wallet availability forever.
 */
export const expirePendingOrders = async (): Promise<number> => {
  const expiryDate = new Date(
    Date.now() - ORDER_PAYMENT_EXPIRY_HOURS * 60 * 60 * 1000
  );

  const expiredOrders = await prisma.order.findMany({
    where: {
      paymentStatus: 'pending',
      fulfillmentStatus: 'pending',
      createdAt: { lte: expiryDate },
    },
    select: {
      id: true,
      orderNumber: true,
      auctionId: true,
      buyerId: true,
      totalAmount: true,
    },
    take: 50,
  });

  let expiredCount = 0;

  for (const order of expiredOrders) {
    try {
      const result = await prisma.$transaction(async tx => {
        const freshOrder = await tx.order.findFirst({
          where: {
            id: order.id,
            paymentStatus: 'pending',
            fulfillmentStatus: 'pending',
          },
        });

        if (!freshOrder) return;

        const auction = order.auctionId
          ? await tx.auction.findUnique({
              where: { id: order.auctionId },
              include: { gadget: true },
            })
          : null;

        await tx.order.update({
          where: { id: order.id },
          data: {
            fulfillmentStatus: 'cancelled',
            updatedAt: new Date(),
          },
        });

        let forfeitedAmount = 0;
        let secondPlaceBidder:
          | {
              id: string;
              fullName: string | null;
              phoneNumber: string | null;
              amount: number;
            }
          | undefined;

        if (order.auctionId && order.buyerId) {
          const winningBid = await tx.bid.findFirst({
            where: {
              auctionId: order.auctionId,
              bidderId: order.buyerId,
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
            const balanceAfter = balance - heldAmount;
            forfeitedAmount = heldAmount;

            await tx.bidHold.update({
              where: { id: winningBid.bidHold.id },
              data: { status: 'charged', releasedAt: new Date() },
            });

            if (wallet) {
              await tx.wallet.update({
                where: { id: wallet.id },
                data: {
                  balance: balanceAfter,
                  isLocked: true,
                },
              });

              await tx.walletTransaction.create({
                data: {
                  walletId: wallet.id,
                  transactionType: 'fee',
                  amount: heldAmount,
                  balanceBefore: balance,
                  balanceAfter,
                  description: `Forfeited bid commitment for unpaid order ${order.orderNumber}`,
                  status: 'completed',
                },
              });

              await tx.walletTransaction.create({
                data: {
                  walletId: wallet.id,
                  transactionType: 'fee',
                  amount: BID_DEFAULT_PENALTY_AMOUNT,
                  balanceBefore: balanceAfter,
                  balanceAfter,
                  description: `Outstanding reactivation penalty for unpaid order ${order.orderNumber}`,
                  metadata: {
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    penaltyReason: 'unpaid_winning_bid',
                  },
                  status: 'pending',
                },
              });
            }
          }

          await tx.user.update({
            where: { id: order.buyerId },
            data: { isActive: false },
          });

          await tx.bid.updateMany({
            where: {
              auctionId: order.auctionId,
              bidderId: order.buyerId,
              status: 'won',
            },
            data: { status: 'withdrawn', isWinning: false },
          });

          const secondBid = await tx.bid.findFirst({
            where: {
              auctionId: order.auctionId,
              bidderId: { not: order.buyerId },
            },
            include: {
              bidder: {
                select: {
                  id: true,
                  fullName: true,
                  phoneNumber: true,
                },
              },
            },
            orderBy: [{ amount: 'desc' }, { bidTime: 'asc' }],
          });

          if (secondBid?.bidder) {
            secondPlaceBidder = {
              id: secondBid.bidder.id,
              fullName: secondBid.bidder.fullName,
              phoneNumber: secondBid.bidder.phoneNumber,
              amount: toNumber(secondBid.amount),
            };
          }
        }

        return {
          gadgetTitle: auction?.gadget?.title || 'Item',
          orderTotal: toNumber(order.totalAmount),
          forfeitedAmount,
          secondPlaceBidder,
        };
      });

      expiredCount += 1;
      logger.info(`Expired unpaid order ${order.orderNumber}`);

      if (order.buyerId) {
        notificationService
          .createNotification(
            order.buyerId,
            'bid_defaulted',
            'Winning bid payment missed',
            `You missed the 24-hour payment window for order #${order.orderNumber}. Your ₦${(result?.forfeitedAmount || 0).toLocaleString()} commitment has been forfeited and your account is suspended. Contact support to pay the ₦${BID_DEFAULT_PENALTY_AMOUNT.toLocaleString()} penalty.`,
            {
              orderId: order.id,
              orderNumber: order.orderNumber,
              penaltyAmount: BID_DEFAULT_PENALTY_AMOUNT,
            },
            ['push']
          )
          .catch(error => {
            logger.error('Failed to notify defaulted buyer:', error);
          });
      }

      notificationService
        .notifyAdmins(
          'bid_defaulted',
          'Winning bidder missed payment',
          `Order #${order.orderNumber} was not paid within 24 hours. The ₦${(result?.forfeitedAmount || 0).toLocaleString()} commitment was forfeited. ${result?.secondPlaceBidder ? 'The second-place offer is being created automatically.' : 'No second-place bidder is available.'}`,
          {
            orderId: order.id,
            orderNumber: order.orderNumber,
            auctionId: order.auctionId,
            route: '/orders',
            secondPlaceBidder: result?.secondPlaceBidder,
          }
        )
        .catch(error => {
          logger.error('Failed to notify admins about bid default:', error);
        });

      if (result?.secondPlaceBidder) {
        offerOrderToSecondPlaceBidder(order.id).catch(error => {
          logger.error('Failed to create second-place offer:', error);
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
    open_dispute: order.disputes?.some((d: any) =>
      ['open', 'investigating'].includes(d.status)
    ),
    created_at: order.createdAt?.toISOString(),
    updated_at: order.updatedAt?.toISOString(),
    auction: order.auction
      ? {
          id: order.auction.id,
          starting_price: toNumber(order.auction.startingPrice),
          current_price: toNumber(order.auction.currentPrice),
          end_time: order.auction.endTime?.toISOString(),
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
