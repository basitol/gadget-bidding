import { body, query, param, ValidationChain } from 'express-validator';

/**
 * Validate create auction request
 */
export const validateCreateAuction: ValidationChain[] = [
  body('gadget_id')
    .trim()
    .notEmpty()
    .withMessage('Gadget ID is required')
    .isUUID()
    .withMessage('Gadget ID must be a valid UUID'),
  body('starting_price')
    .isFloat({ min: 100 })
    .withMessage('Starting price must be at least ₦100'),
  body('reserve_price')
    .optional()
    .isFloat({ min: 100 })
    .withMessage('Reserve price must be at least ₦100'),
  body('buy_now_price')
    .optional()
    .isFloat({ min: 100 })
    .withMessage('Buy now price must be at least ₦100'),
  body('bid_increment')
    .optional()
    .isFloat({ min: 10 })
    .withMessage('Bid increment must be at least ₦10'),
  body('start_time')
    .notEmpty()
    .withMessage('Start time is required')
    .isISO8601()
    .withMessage('Start time must be a valid ISO 8601 date'),
  body('end_time')
    .notEmpty()
    .withMessage('End time is required')
    .isISO8601()
    .withMessage('End time must be a valid ISO 8601 date'),
  body('auto_extend_enabled')
    .optional()
    .isBoolean()
    .withMessage('Auto extend enabled must be a boolean'),
  body('auto_extend_minutes')
    .optional()
    .isInt({ min: 1, max: 30 })
    .withMessage('Auto extend minutes must be between 1 and 30'),
];

/**
 * Validate update auction request
 */
export const validateUpdateAuction: ValidationChain[] = [
  param('id')
    .trim()
    .notEmpty()
    .withMessage('Auction ID is required')
    .isUUID()
    .withMessage('Auction ID must be a valid UUID'),
  body('starting_price')
    .optional()
    .isFloat({ min: 100 })
    .withMessage('Starting price must be at least ₦100'),
  body('reserve_price')
    .optional()
    .isFloat({ min: 100 })
    .withMessage('Reserve price must be at least ₦100'),
  body('buy_now_price')
    .optional()
    .isFloat({ min: 100 })
    .withMessage('Buy now price must be at least ₦100'),
  body('start_time')
    .optional()
    .isISO8601()
    .withMessage('Start time must be a valid ISO 8601 date'),
  body('end_time')
    .optional()
    .isISO8601()
    .withMessage('End time must be a valid ISO 8601 date'),
];

/**
 * Validate auction ID parameter
 */
export const validateAuctionId: ValidationChain[] = [
  param('id')
    .trim()
    .notEmpty()
    .withMessage('Auction ID is required')
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .withMessage('Auction ID must be a valid UUID'),
];

/**
 * Validate auction filters
 */
export const validateAuctionFilters: ValidationChain[] = [
  query('category_id')
    .optional()
    .trim()
    .isUUID()
    .withMessage('Category ID must be a valid UUID'),
  query('status')
    .optional()
    .isIn(['scheduled', 'active', 'ended', 'cancelled'])
    .withMessage('Status must be one of: scheduled, active, ended, cancelled'),
  query('seller_id')
    .optional()
    .trim()
    .isUUID()
    .withMessage('Seller ID must be a valid UUID'),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Search query must be between 2 and 100 characters'),
  query('min_price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum price must be a non-negative number'),
  query('max_price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum price must be a non-negative number'),
  query('sort_by')
    .optional()
    .isIn(['newest', 'price_asc', 'price_desc', 'ending_soon'])
    .withMessage(
      'Sort by must be one of: newest, price_asc, price_desc, ending_soon'
    ),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];
