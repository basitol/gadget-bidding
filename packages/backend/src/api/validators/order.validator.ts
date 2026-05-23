import { body, param, query } from 'express-validator';

/**
 * Validate order ID param
 */
export const validateOrderId = [
  param('orderId')
    .notEmpty()
    .withMessage('Order ID is required')
    .isUUID()
    .withMessage('Invalid order ID'),
];

/**
 * Validate order number param
 */
export const validateOrderNumber = [
  param('orderNumber')
    .notEmpty()
    .withMessage('Order number is required')
    .matches(/^GB-[A-Z0-9]+-[A-Z0-9]+$/)
    .withMessage('Invalid order number format'),
];

/**
 * Validate shipping address
 */
export const validateShippingAddress = [
  param('orderId')
    .notEmpty()
    .withMessage('Order ID is required')
    .isUUID()
    .withMessage('Invalid order ID'),
  body('full_name')
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  body('phone_number')
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^\+234[0-9]{10}$/)
    .withMessage(
      'Phone number must be a valid Nigerian number (+234XXXXXXXXXX)'
    ),
  body('address_line1')
    .notEmpty()
    .withMessage('Address line 1 is required')
    .isLength({ min: 5, max: 200 })
    .withMessage('Address must be between 5 and 200 characters'),
  body('address_line2')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Address line 2 must be less than 200 characters'),
  body('city')
    .notEmpty()
    .withMessage('City is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('City must be between 2 and 100 characters'),
  body('state')
    .notEmpty()
    .withMessage('State is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('State must be between 2 and 100 characters'),
  body('postal_code')
    .optional()
    .isLength({ max: 20 })
    .withMessage('Postal code must be less than 20 characters'),
  body('country')
    .optional()
    .default('Nigeria')
    .isLength({ max: 100 })
    .withMessage('Country must be less than 100 characters'),
];

/**
 * Validate fulfillment status update
 */
export const validateFulfillmentUpdate = [
  param('orderId')
    .notEmpty()
    .withMessage('Order ID is required')
    .isUUID()
    .withMessage('Invalid order ID'),
  body('status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn(['processing', 'shipped', 'delivered', 'cancelled'])
    .withMessage('Invalid fulfillment status'),
  body('tracking_number')
    .optional()
    .isLength({ min: 5, max: 100 })
    .withMessage('Tracking number must be between 5 and 100 characters'),
];

/**
 * Validate orders query params
 */
export const validateOrdersQuery = [
  query('status')
    .optional()
    .isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])
    .withMessage('Invalid fulfillment status'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];
