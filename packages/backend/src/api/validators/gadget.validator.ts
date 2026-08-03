import { body, query, param, ValidationChain } from 'express-validator';

/**
 * Validate create gadget request
 */
export const validateCreateGadget: ValidationChain[] = [
  body('category_id')
    .trim()
    .notEmpty()
    .withMessage('Category ID is required')
    .isUUID()
    .withMessage('Category ID must be a valid UUID'),
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('description')
    .trim()
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ min: 20, max: 5000 })
    .withMessage('Description must be between 20 and 5000 characters'),
  body('brand')
    .trim()
    .notEmpty()
    .withMessage('Brand is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Brand must not exceed 100 characters'),
  body('model')
    .trim()
    .notEmpty()
    .withMessage('Model is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Model must not exceed 100 characters'),
  body('condition')
    .notEmpty()
    .withMessage('Condition is required')
    .isIn(['new', 'like_new', 'excellent', 'good', 'fair', 'for_parts'])
    .withMessage(
      'Condition must be one of: new, like_new, excellent, good, fair, for_parts'
    ),
  body('specifications')
    .optional()
    .isObject()
    .withMessage('Specifications must be an object'),
  body('images')
    .isArray({ min: 1, max: 10 })
    .withMessage('At least 1 image is required, maximum 10 images')
    .custom((value) => {
      if (!value.every((url: string) => typeof url === 'string' && url.length > 0)) {
        throw new Error('All images must be valid URLs');
      }
      return true;
    }),
  body('auction_starting_price')
    .optional()
    .isFloat({ min: 1000 })
    .withMessage('Starting price must be at least ₦1,000'),
  body('auction_reserve_price')
    .optional()
    .isFloat({ min: 1000 })
    .withMessage('Reserve price must be at least ₦1,000')
    .custom((value, { req }) => {
      if (value != null && req.body.auction_starting_price != null && value < req.body.auction_starting_price) {
        throw new Error('Reserve price must be higher than starting price');
      }
      return true;
    }),
  body('auction_buy_now_price')
    .optional()
    .isFloat({ min: 1000 })
    .withMessage('Buy Now price must be at least ₦1,000')
    .custom((value, { req }) => {
      if (value != null && req.body.auction_starting_price != null && value <= req.body.auction_starting_price) {
        throw new Error('Buy Now price must be higher than starting price');
      }
      return true;
    }),
  body('auction_bid_increment')
    .optional()
    .isFloat({ min: 500 })
    .withMessage('Bid increment must be at least ₦500'),
  body('auction_duration_hours')
    .optional()
    .isInt({ min: 1, max: 168 })
    .withMessage('Auction duration must be between 1 and 168 hours'),
  body('auction_start_now')
    .optional()
    .isBoolean()
    .withMessage('auction_start_now must be a boolean'),
];

/**
 * Validate update gadget request
 */
export const validateUpdateGadget: ValidationChain[] = [
  param('id')
    .trim()
    .notEmpty()
    .withMessage('Gadget ID is required')
    .isUUID()
    .withMessage('Gadget ID must be a valid UUID'),
  body('category_id')
    .optional()
    .trim()
    .isUUID()
    .withMessage('Category ID must be a valid UUID'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 20, max: 5000 })
    .withMessage('Description must be between 20 and 5000 characters'),
  body('brand')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Brand must not exceed 100 characters'),
  body('model')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Model must not exceed 100 characters'),
  body('condition')
    .optional()
    .isIn(['new', 'like_new', 'excellent', 'good', 'fair', 'for_parts'])
    .withMessage(
      'Condition must be one of: new, like_new, excellent, good, fair, for_parts'
    ),
  body('specifications')
    .optional()
    .isObject()
    .withMessage('Specifications must be an object'),
  body('images')
    .optional()
    .isArray({ min: 1, max: 10 })
    .withMessage('At least 1 image is required, maximum 10 images'),
];

/**
 * Validate gadget ID parameter
 */
export const validateGadgetId: ValidationChain[] = [
  param('id')
    .trim()
    .notEmpty()
    .withMessage('Gadget ID is required')
    .isUUID()
    .withMessage('Gadget ID must be a valid UUID'),
];

/**
 * Validate gadget filters
 */
export const validateGadgetFilters: ValidationChain[] = [
  query('category_id')
    .optional()
    .trim()
    .isUUID()
    .withMessage('Category ID must be a valid UUID'),
  query('status')
    .optional()
    .isIn(['pending', 'approved', 'rejected', 'listed', 'sold'])
    .withMessage(
      'Status must be one of: pending, approved, rejected, listed, sold'
    ),
  query('seller_id')
    .optional()
    .trim()
    .isUUID()
    .withMessage('Seller ID must be a valid UUID'),
  query('condition')
    .optional()
    .isIn(['new', 'like_new', 'excellent', 'good', 'fair', 'for_parts'])
    .withMessage(
      'Condition must be one of: new, like_new, excellent, good, fair, for_parts'
    ),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Search query must be between 2 and 100 characters'),
  query('min_bids')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minimum bids must be a non-negative integer'),
  query('sort_by')
    .optional()
    .isIn(['newest', 'oldest', 'name_asc', 'name_desc'])
    .withMessage('Sort by must be one of: newest, oldest, name_asc, name_desc'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];

/**
 * Validate admin review request
 */
export const validateAdminReview: ValidationChain[] = [
  param('id')
    .trim()
    .notEmpty()
    .withMessage('Gadget ID is required')
    .isUUID()
    .withMessage('Gadget ID must be a valid UUID'),
  body('rejection_reason')
    .optional()
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Rejection reason must be between 10 and 500 characters'),
];
