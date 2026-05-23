import { Router } from 'express';
import * as bidController from '../controllers/bid.controller';
import * as bidValidator from '../validators/bid.validator';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { authenticate } from '../middlewares/auth.middleware';

const router: Router = Router();

/**
 * @route   GET /api/v1/bids/my-bids
 * @desc    Get current user's bids
 * @access  Private
 */
router.get(
  '/my-bids',
  authenticate,
  bidValidator.validateUserBidsQuery,
  handleValidationErrors,
  bidController.getMyBids
);

/**
 * @route   GET /api/v1/bids/my-bids/active
 * @desc    Get current user's active (winning) bids
 * @access  Private
 */
router.get('/my-bids/active', authenticate, bidController.getMyActiveBids);

/**
 * @route   GET /api/v1/bids/auction/:auctionId
 * @desc    Get bids for an auction
 * @access  Public
 */
router.get(
  '/auction/:auctionId',
  bidValidator.validateAuctionBidsQuery,
  handleValidationErrors,
  bidController.getAuctionBids
);

/**
 * @route   GET /api/v1/bids/auction/:auctionId/highest
 * @desc    Get highest bid for an auction
 * @access  Public
 */
router.get(
  '/auction/:auctionId/highest',
  bidValidator.validateAuctionId,
  handleValidationErrors,
  bidController.getHighestBid
);

/**
 * @route   POST /api/v1/bids
 * @desc    Place a bid on an auction
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  bidValidator.validatePlaceBid,
  handleValidationErrors,
  bidController.placeBid
);

/**
 * @route   POST /api/v1/bids/buy-now/:auctionId
 * @desc    Buy now - instantly win the auction
 * @access  Private
 */
router.post(
  '/buy-now/:auctionId',
  authenticate,
  bidValidator.validateBuyNow,
  handleValidationErrors,
  bidController.buyNow
);

/**
 * @route   GET /api/v1/bids/:bidId
 * @desc    Get bid by ID
 * @access  Public
 */
router.get(
  '/:bidId',
  bidValidator.validateBidId,
  handleValidationErrors,
  bidController.getBidById
);

export default router;
