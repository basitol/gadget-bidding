import { body, param, query } from 'express-validator';

/**
 * Validate place bid request
 */
export const validatePlaceBid = [
  body('auction_id')
    .notEmpty()
    .withMessage('Auction ID is required')
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .withMessage('Invalid auction ID format'),
  body('amount')
    .notEmpty()
    .withMessage('Bid amount is required')
    .isNumeric()
    .withMessage('Amount must be a number')
    .custom(value => {
      const num = parseFloat(value);
      if (num < 100) {
        throw new Error('Minimum bid amount is ₦100');
      }
      return true;
    }),
];

/**
 * Validate buy now request
 */
export const validateBuyNow = [
  param('auctionId')
    .notEmpty()
    .withMessage('Auction ID is required')
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .withMessage('Invalid auction ID'),
];

/**
 * Validate auction ID param
 */
export const validateAuctionId = [
  param('auctionId')
    .notEmpty()
    .withMessage('Auction ID is required')
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .withMessage('Invalid auction ID'),
];

/**
 * Validate bid ID param
 */
export const validateBidId = [
  param('bidId')
    .notEmpty()
    .withMessage('Bid ID is required')
    .isUUID()
    .withMessage('Invalid bid ID'),
];

/**
 * Validate user bids query params
 */
export const validateUserBidsQuery = [
  query('status')
    .optional()
    .isIn(['active', 'outbid', 'withdrawn', 'won'])
    .withMessage('Invalid bid status'),
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
 * Validate auction bids query params
 */
export const validateAuctionBidsQuery = [
  param('auctionId')
    .notEmpty()
    .withMessage('Auction ID is required')
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .withMessage('Invalid auction ID'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];
