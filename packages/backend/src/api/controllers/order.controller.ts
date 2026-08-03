import { Request, Response } from 'express';
import { sendSuccess, sendError, sendPaginated } from '../../utils/response';
import * as orderService from '../../services/order/order.service';
import * as riskService from '../../services/risk/risk.service';
import * as auditService from '../../services/audit/audit.service';
import logger from '../../utils/logger';

const hideBuyerAddress = <T extends { shipping_address?: unknown }>(
  order: T
): T => ({
  ...order,
  shipping_address: undefined,
});

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

    sendSuccess(
      res,
      order.seller_id === req.user.user_id ? hideBuyerAddress(order) : order
    );
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
      order.seller_id === req.user.user_id ? hideBuyerAddress(order) : order
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

    sendPaginated(res, orders, page, limit, total);
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

    sendPaginated(res, orders.map(hideBuyerAddress), page, limit, total);
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
    const address = req.body;

    const order = await orderService.updateShippingAddress(
      orderId,
      req.user.user_id,
      address
    );

    sendSuccess(res, order, 'Shipping address updated successfully');
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

    sendSuccess(res, order, 'Payment confirmed successfully');
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

    sendSuccess(res, order, `Order status updated to ${status}`);
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

    sendSuccess(res, order, 'Delivery confirmed successfully');
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

    const dispute = await orderService.createDispute(
      orderId,
      req.user.user_id,
      dispute_type,
      description
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
    const { callback_url } = req.body;

    // Get user email (or use phone as fallback)
    const email =
      (req.user as any).email || `${req.user.phone_number}@gadgetbid.ng`;

    const paymentData = await orderService.initializeOrderPayment(
      orderId,
      req.user.user_id,
      email,
      callback_url
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

    sendSuccess(res, order, 'Payment verified successfully');
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
