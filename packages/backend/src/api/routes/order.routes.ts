import { Router } from 'express';
import * as orderController from '../controllers/order.controller';
import * as orderValidator from '../validators/order.validator';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { authenticate } from '../middlewares/auth.middleware';
import {
  paymentVerificationRateLimiter,
  walletFundingRateLimiter,
} from '../middlewares/security.middleware';

const router: Router = Router();

/**
 * @route   GET /api/v1/orders/stats
 * @desc    Get order statistics
 * @access  Private
 */
router.get('/stats', authenticate, orderController.getOrderStats);

/**
 * @route   GET /api/v1/orders/my-purchases
 * @desc    Get user's purchases (as buyer)
 * @access  Private
 */
router.get(
  '/my-purchases',
  authenticate,
  orderValidator.validateOrdersQuery,
  handleValidationErrors,
  orderController.getMyPurchases
);

/**
 * @route   GET /api/v1/orders/my-sales
 * @desc    Get user's sales (as seller)
 * @access  Private
 */
router.get(
  '/my-sales',
  authenticate,
  orderValidator.validateOrdersQuery,
  handleValidationErrors,
  orderController.getMySales
);

/**
 * @route   GET /api/v1/orders/number/:orderNumber
 * @desc    Get order by order number
 * @access  Private
 */
router.get(
  '/number/:orderNumber',
  authenticate,
  orderValidator.validateOrderNumber,
  handleValidationErrors,
  orderController.getOrderByNumber
);

/**
 * @route   GET /api/v1/orders/:orderId
 * @desc    Get order by ID
 * @access  Private
 */
router.get(
  '/:orderId',
  authenticate,
  orderValidator.validateOrderId,
  handleValidationErrors,
  orderController.getOrderById
);

/**
 * @route   PUT /api/v1/orders/:orderId/shipping-address
 * @desc    Update shipping address
 * @access  Private (Buyer only)
 */
router.put(
  '/:orderId/shipping-address',
  authenticate,
  orderValidator.validateShippingAddress,
  handleValidationErrors,
  orderController.updateShippingAddress
);

/**
 * @route   POST /api/v1/orders/:orderId/confirm-payment
 * @desc    Confirm payment for order (wallet-based)
 * @access  Private (Buyer only)
 */
router.post(
  '/:orderId/confirm-payment',
  paymentVerificationRateLimiter,
  authenticate,
  orderValidator.validateOrderId,
  handleValidationErrors,
  orderController.confirmPayment
);

/**
 * @route   POST /api/v1/orders/:orderId/payment/initialize
 * @desc    Initialize Paystack payment for order
 * @access  Private (Buyer only)
 */
router.post(
  '/:orderId/payment/initialize',
  walletFundingRateLimiter,
  authenticate,
  orderValidator.validateOrderId,
  handleValidationErrors,
  orderController.initializePayment
);

/**
 * @route   GET /api/v1/orders/:orderId/payment/verify
 * @desc    Verify Paystack payment for order
 * @access  Private (Buyer only)
 */
router.get(
  '/:orderId/payment/verify',
  paymentVerificationRateLimiter,
  authenticate,
  orderValidator.validateOrderId,
  handleValidationErrors,
  orderController.verifyPayment
);

/**
 * @route   PUT /api/v1/orders/:orderId/fulfillment
 * @desc    Update fulfillment status
 * @access  Private (Seller only)
 */
router.put(
  '/:orderId/fulfillment',
  authenticate,
  orderValidator.validateFulfillmentUpdate,
  handleValidationErrors,
  orderController.updateFulfillmentStatus
);

/**
 * @route   POST /api/v1/orders/:orderId/confirm-delivery
 * @desc    Confirm delivery
 * @access  Private (Buyer only)
 */
router.post(
  '/:orderId/confirm-delivery',
  authenticate,
  orderValidator.validateOrderId,
  handleValidationErrors,
  orderController.confirmDelivery
);

/**
 * @route   POST /api/v1/orders/:orderId/disputes
 * @desc    Open dispute for an order
 * @access  Private (Buyer or seller)
 */
router.post(
  '/:orderId/disputes',
  authenticate,
  orderValidator.validateDisputeCreate,
  handleValidationErrors,
  orderController.createDispute
);

export default router;
