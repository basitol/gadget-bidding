import prisma from '../../config/prisma';
import {
  Order,
  OrderWithDetails,
  ShippingAddress,
  FulfillmentStatus,
  PaymentStatusType,
  PLATFORM_FEE_PERCENTAGE,
  PaystackInitializeResponse,
} from '@gadget-bidding/shared';
import * as walletService from '../wallet/wallet.service';
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
  payment_status: order.paymentStatus as PaymentStatusType,
  fulfillment_status: order.fulfillmentStatus as FulfillmentStatus,
  shipping_address: order.shippingAddress,
  tracking_number: order.trackingNumber,
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
      throw new Error('Order already exists for this auction');
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
        paymentStatus: 'pending',
        fulfillmentStatus: 'pending',
      },
    });

    // Update auction status to completed
    await tx.auction.update({
      where: { id: auctionId },
      data: { status: 'ended' },
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
      fulfillmentStatus: 'pending',
    },
    data: {
      shippingAddress: address as any,
    },
  });

  if (order.count === 0) {
    throw new Error('Order not found, unauthorized, or already processing');
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
  return prisma.$transaction(async tx => {
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

    // Charge the held amount
    await walletService.chargeHold(winningBid.id);

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
    processing: ['shipped', 'cancelled'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: [],
  };

  return prisma.$transaction(async tx => {
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
    if (status === 'shipped' && trackingNumber) {
      updateData.trackingNumber = trackingNumber;
    }

    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: updateData,
    });

    // If delivered, credit seller
    if (status === 'delivered') {
      await creditSeller(tx, order);
    }

    // If cancelled, refund buyer
    if (status === 'cancelled' && order.paymentStatus === 'paid') {
      await refundBuyer(tx, order);
    }

    logger.info(`Order ${order.orderNumber} status updated to: ${status}`);

    return transformOrder(updatedOrder);
  });
};

/**
 * Mark order as delivered (buyer confirmation)
 */
export const confirmDelivery = async (
  orderId: string,
  buyerId: string
): Promise<Order> => {
  return prisma.$transaction(async tx => {
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

    // Credit seller
    await creditSeller(tx, order);

    logger.info(`Delivery confirmed for order: ${order.orderNumber}`);

    return transformOrder(updatedOrder);
  });
};

/**
 * Credit seller after successful delivery
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
      // Release the hold since payment was made via Paystack
      await tx.bidHold.update({
        where: { id: winningBid.bidHold.id },
        data: {
          status: 'released',
          releasedAt: new Date(),
        },
      });

      // Restore wallet balance
      const wallet = await tx.wallet.findUnique({
        where: { userId: order.buyerId! },
      });

      if (wallet) {
        const heldAmount = toNumber(winningBid.bidHold.amount);
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: { increment: heldAmount },
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
      } catch (err) {
        logger.error('Failed to send payment notifications:', err);
      }
    });

    return transformOrder(updatedOrder);
  });
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
          fulfillmentStatus: { in: ['pending', 'processing', 'shipped'] },
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
    payment_status: order.paymentStatus,
    fulfillment_status: order.fulfillmentStatus,
    shipping_address: order.shippingAddress,
    tracking_number: order.trackingNumber,
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
  } as OrderWithDetails;
};
