import { Request, Response } from 'express';
import { sendSuccess, sendError, sendPaginated } from '../../utils/response';
import * as orderService from '../../services/order/order.service';
import * as riskService from '../../services/risk/risk.service';
import * as auditService from '../../services/audit/audit.service';
import logger from '../../utils/logger';
import prisma from '../../config/prisma';
import { sellerCode } from '../../services/buyer/sellerSummary.service';

const hideBuyerAddress = <T extends { shipping_address?: unknown }>(
  order: T
): T => ({
  ...order,
  shipping_address: undefined,
});

/** Sellers stay anonymous to buyers ("Verified seller CV-1042"): no name or phone. */
const maskSellerForBuyer = (o: any) =>
  o.seller ? { ...o, seller: { id: o.seller.id, full_name: sellerCode(o.seller.id) } } : o;

/** Buyers stay anonymous to sellers: only the order number, no name, phone or address. */
const maskBuyerForSeller = (o: any) => ({ ...hideBuyerAddress(o), buyer: undefined });

/** Mask whichever side the viewer isn't, for any order-shaped response. */
const forViewer = (o: any, userId: string) => {
  if (!o || typeof o !== 'object') return o;
  return o.seller_id === userId ? maskBuyerForSeller(o) : maskSellerForBuyer(o);
};

/**
 * Get order by ID
 * GET /api/v1/orders/:orderId
 */
export const getOrderById = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { orderId } = req.params;
    const order = await orderService.getOrderById(orderId);

    if (!order) {
      return sendError(res, 'Order not found', 404);
    }

    // Only buyer or seller can view order
    if (
      order.buyer_id !== req.user.user_id &&
      order.seller_id !== req.user.user_id
    ) {
      return sendError(res, 'Unauthorized to view this order', 403);
    }

    if (order.seller_id === req.user.user_id) {
      return sendSuccess(res, maskBuyerForSeller(order));
    }
    const paidWith =
      order.payment_status === 'paid'
        ? await orderService.paymentMethodLabel(order.id, order.order_number)
        : null;
    sendSuccess(res, {
      ...maskSellerForBuyer(order),
      paid_with: paidWith,
      address_editable:
        order.delivery_method !== 'pickup' &&
        orderService.ADDRESS_EDITABLE_STATUSES.includes(order.fulfillment_status),
    });
  } catch (error: any) {
    logger.error('Get order error:', error);
    sendError(res, error.message || 'Failed to get order', 500);
  }
};

/**
 * Get order by order number
 * GET /api/v1/orders/number/:orderNumber
 */
export const getOrderByNumber = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { orderNumber } = req.params;
    const order = await orderService.getOrderByNumber(orderNumber);

    if (!order) {
      return sendError(res, 'Order not found', 404);
    }

    // Only buyer or seller can view order
    if (
      order.buyer_id !== req.user.user_id &&
      order.seller_id !== req.user.user_id
    ) {
      return sendError(res, 'Unauthorized to view this order', 403);
    }

    sendSuccess(
      res,
      order.seller_id === req.user.user_id
        ? maskBuyerForSeller(order)
        : maskSellerForBuyer(order)
    );
  } catch (error: any) {
    logger.error('Get order by number error:', error);
    sendError(res, error.message || 'Failed to get order', 500);
  }
};

/**
 * Get user's purchases (as buyer)
 * GET /api/v1/orders/my-purchases
 */
export const getMyPurchases = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const status = req.query.status as any;

    const { orders, total } = await orderService.getBuyerOrders(
      req.user.user_id,
      page,
      limit,
      status
    );

    sendPaginated(res, orders.map(maskSellerForBuyer), page, limit, total);
  } catch (error: any) {
    logger.error('Get my purchases error:', error);
    sendError(res, error.message || 'Failed to get purchases', 500);
  }
};

/**
 * Get user's sales (as seller)
 * GET /api/v1/orders/my-sales
 */
export const getMySales = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const status = req.query.status as any;

    const { orders, total } = await orderService.getSellerOrders(
      req.user.user_id,
      page,
      limit,
      status
    );

    sendPaginated(res, orders.map(maskBuyerForSeller), page, limit, total);
  } catch (error: any) {
    logger.error('Get my sales error:', error);
    sendError(res, error.message || 'Failed to get sales', 500);
  }
};

/**
 * Update shipping address
 * PUT /api/v1/orders/:orderId/shipping-address
 */
export const updateShippingAddress = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { orderId } = req.params;
    // Only the address fields go on the order (it's stored as JSON).
    const b = req.body ?? {};
    const address = {
      // The saved address's name ("Home", "Work"), when the buyer picked one.
      label: typeof b.label === 'string' && b.label.trim() ? b.label.trim().slice(0, 80) : undefined,
      full_name: b.full_name,
      phone_number: b.phone_number,
      address_line1: b.address_line1,
      address_line2: b.address_line2 || undefined,
      city: b.city,
      state: b.state,
      postal_code: b.postal_code || undefined,
      country: b.country || 'Nigeria',
      delivery_note: b.delivery_note || undefined,
    };

    const order = await orderService.updateShippingAddress(
      orderId,
      req.user.user_id,
      address
    );

    sendSuccess(res, forViewer(order, req.user.user_id), 'Shipping address updated successfully');
  } catch (error: any) {
    logger.error('Update shipping address error:', error);
    sendError(res, error.message || 'Failed to update shipping address', 400);
  }
};

/**
 * Confirm payment for order
 * POST /api/v1/orders/:orderId/confirm-payment
 */
export const confirmPayment = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { orderId } = req.params;

    // Verify buyer owns the order
    const existingOrder = await orderService.getOrderById(orderId);
    if (!existingOrder) {
      return sendError(res, 'Order not found', 404);
    }

    if (existingOrder.buyer_id !== req.user.user_id) {
      return sendError(res, 'Unauthorized', 403);
    }

    const order = await orderService.confirmPayment(orderId);

    sendSuccess(res, forViewer(order, req.user!.user_id), 'Payment confirmed successfully');
  } catch (error: any) {
    logger.error('Confirm payment error:', error);
    sendError(res, error.message || 'Failed to confirm payment', 400);
  }
};

/**
 * Update fulfillment status (seller action)
 * PUT /api/v1/orders/:orderId/fulfillment
 */
export const updateFulfillmentStatus = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { orderId } = req.params;
    const { status, tracking_number } = req.body;

    const order = await orderService.updateFulfillmentStatus(
      orderId,
      req.user.user_id,
      status,
      tracking_number
    );

    sendSuccess(res, forViewer(order, req.user!.user_id), `Order status updated to ${status}`);
  } catch (error: any) {
    logger.error('Update fulfillment status error:', error);
    sendError(res, error.message || 'Failed to update fulfillment status', 400);
  }
};

/**
 * Confirm delivery (buyer action)
 * POST /api/v1/orders/:orderId/confirm-delivery
 */
export const confirmDelivery = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { orderId } = req.params;

    const order = await orderService.confirmDelivery(orderId, req.user.user_id);

    sendSuccess(res, forViewer(order, req.user!.user_id), 'Delivery confirmed successfully');
  } catch (error: any) {
    logger.error('Confirm delivery error:', error);
    sendError(res, error.message || 'Failed to confirm delivery', 400);
  }
};

/**
 * Open dispute for an order
 * POST /api/v1/orders/:orderId/disputes
 */
export const createDispute = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { orderId } = req.params;
    const { dispute_type, description } = req.body as {
      dispute_type: string;
      description: string;
    };

    const evidence = Array.isArray(req.body.evidence) ? (req.body.evidence as string[]) : undefined;
    const dispute = await orderService.createDispute(
      orderId,
      req.user.user_id,
      dispute_type,
      description,
      evidence
    );

    sendSuccess(res, dispute, 'Dispute opened successfully', 201);
  } catch (error: any) {
    logger.error('Create dispute error:', error);
    sendError(res, error.message || 'Failed to open dispute', 400);
  }
};

/**
 * Get order statistics
 * GET /api/v1/orders/stats
 */
export const getOrderStats = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const stats = await orderService.getOrderStats(req.user.user_id);

    sendSuccess(res, stats);
  } catch (error: any) {
    logger.error('Get order stats error:', error);
    sendError(res, error.message || 'Failed to get order statistics', 500);
  }
};

/**
 * Initialize payment for order (Paystack)
 * POST /api/v1/orders/:orderId/payment/initialize
 */
export const initializePayment = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { orderId } = req.params;
    const { callback_url, channel } = req.body;
    const allowed = ['card', 'bank_transfer', 'ussd'];

    // Paystack needs the buyer's real email (receipts, saved cards). The token doesn't carry it.
    const account = await prisma.user.findUnique({
      where: { id: req.user.user_id },
      select: { email: true, phoneNumber: true },
    });
    const email =
      account?.email || `${(account?.phoneNumber || req.user.phone_number).replace(/\D/g, '')}@gadgetbid.ng`;

    const paymentData = await orderService.initializeOrderPayment(
      orderId,
      req.user.user_id,
      email,
      callback_url,
      allowed.includes(channel) ? channel : undefined
    );

    sendSuccess(res, paymentData, 'Payment initialized successfully');
  } catch (error: any) {
    logger.error('Initialize order payment error:', error);
    sendError(res, error.message || 'Failed to initialize payment', 400);
  }
};

/**
 * Verify payment for order
 * GET /api/v1/orders/:orderId/payment/verify
 */
export const verifyPayment = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { orderId } = req.params;
    const { reference } = req.query;

    if (!reference || typeof reference !== 'string') {
      return sendError(res, 'Payment reference is required', 400);
    }

    const order = await orderService.verifyOrderPayment(
      orderId,
      req.user.user_id,
      reference
    );

    sendSuccess(res, forViewer(order, req.user!.user_id), 'Payment verified successfully');
  } catch (error: any) {
    logger.error('Verify order payment error:', error);
    auditService.recordPaymentVerificationFailed(
      req,
      typeof req.query.reference === 'string' ? req.query.reference : undefined,
      error.message || 'Failed to verify payment'
    );
    riskService
      .recordPaymentFailure(
        req.user?.user_id,
        typeof req.query.reference === 'string'
          ? req.query.reference
          : undefined,
        error.message || 'Failed to verify payment'
      )
      .catch(err => {
        logger.error('Failed to record order payment risk:', err);
      });
    sendError(res, error.message || 'Failed to verify payment', 400);
  }
};

/**
 * Choose delivery or hub pickup (before paying)
 * PUT /api/v1/orders/:orderId/delivery-method  { method: 'delivery' | 'pickup' }
 */
export const setDeliveryMethod = async (req: Request, res: Response) => {
  try {
    if (!req.user) return sendError(res, 'User not authenticated', 401);
    const method = req.body.method === 'pickup' ? 'pickup' : 'delivery';
    const order = await orderService.setDeliveryMethod(req.params.orderId as string, req.user.user_id, method);
    sendSuccess(res, forViewer(order, req.user!.user_id), method === 'pickup' ? "You'll collect it at the hub" : "We'll deliver it to you");
  } catch (error: any) {
    sendError(res, error.message || 'Could not update delivery', 400);
  }
};

/**
 * Email the buyer a receipt
 * POST /api/v1/orders/:orderId/receipt
 */
export const emailReceipt = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }
    const result = await orderService.emailReceipt(req.params.orderId, req.user.user_id);
    sendSuccess(res, result, `Receipt sent to ${result.email}`);
  } catch (error: any) {
    logger.error('Email receipt error:', error);
    sendError(res, error.message || "Couldn't send the receipt", 400);
  }
};

/** Buyer's email for Paystack (receipts, card saving). The token doesn't carry it. */
const buyerEmail = async (userId: string, fallbackPhone?: string) => {
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, phoneNumber: true },
  });
  return account?.email || `${(account?.phoneNumber || fallbackPhone || userId).replace(/\D/g, '')}@gadgetbid.ng`;
};

const run =
  (fn: (req: Request) => Promise<unknown>, message?: string) =>
  async (req: Request, res: Response) => {
    try {
      if (!req.user) return sendError(res, 'User not authenticated', 401);
      sendSuccess(res, forViewer(await fn(req), req.user.user_id), message);
    } catch (error: any) {
      logger.error(`Order action failed (${req.path}):`, error);
      sendError(res, error.message || 'Something went wrong. Try again.', 400);
    }
  };

/** POST /orders/:orderId/payment/bank-transfer — one-time account number */
export const startBankTransfer = run(async req =>
  orderService.startBankTransfer(
    req.params.orderId,
    req.user!.user_id,
    await buyerEmail(req.user!.user_id, req.user!.phone_number)
  )
);

/** POST /orders/:orderId/payment/ussd { bank } — USSD code to dial */
export const startUssd = run(async req =>
  orderService.startUssd(
    req.params.orderId,
    req.user!.user_id,
    await buyerEmail(req.user!.user_id, req.user!.phone_number),
    String(req.body.bank) as any
  )
);

/** GET /orders/:orderId/payment/status?reference= — paid, pending or failed */
export const paymentStatus = run(req =>
  orderService.checkPayment(req.params.orderId, req.user!.user_id, String(req.query.reference || ''))
);

/** POST /orders/:orderId/offer/accept — take a second-chance offer */
export const acceptOffer = run(req => orderService.acceptSecondChance(req.params.orderId, req.user!.user_id), 'Offer accepted');

/** POST /orders/:orderId/offer/decline — pass on a second-chance offer (free) */
export const declineOffer = run(req => orderService.declineSecondChance(req.params.orderId, req.user!.user_id), 'No problem');
