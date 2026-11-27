import { Router, Request, Response } from 'express';
import * as sellerSummary from '../../services/buyer/sellerSummary.service';
import * as auctionController from '../controllers/auction.controller';
import * as auctionValidator from '../validators/auction.validator';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { authenticate, sellerOnly, optionalAuth } from '../middlewares/auth.middleware';

const router: Router = Router();

/**
 * @route   GET /api/v1/auctions/my-auctions
 * @desc    Get current user's auctions
 * @access  Private
 */
router.get('/my-auctions', authenticate, auctionController.getMyAuctions);

/**
 * @route   GET /api/v1/auctions/stats/active-count
 * @desc    Get active auctions count
 * @access  Public
 */
router.get('/stats/active-count', auctionController.getActiveAuctionsCount);

/**
 * @route   GET /api/v1/auctions
 * @desc    Get all auctions with filters
 * @access  Public
 */
router.get(
  '/',
  auctionValidator.validateAuctionFilters,
  handleValidationErrors,
  auctionController.getAuctions
);

/**
 * @route   GET /api/v1/auctions/:id
 * @desc    Get auction by ID
 * @access  Public
 */
router.get(
  '/:id',
  auctionValidator.validateAuctionId,
  handleValidationErrors,
  auctionController.getAuctionById
);

/**
 * @route   GET /api/v1/auctions/:id/bids
 * @desc    Get auction bids
 * @access  Public
 */
/**
 * @route   GET /api/v1/auctions/:id/seller
 * @desc    Public seller summary: code, verified business, rating, sales
 */
router.get('/:id/seller', auctionValidator.validateAuctionId, handleValidationErrors, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await sellerSummary.forAuction(req.params.id as string) });
  } catch (error: any) {
    res.status(404).json({ success: false, error: error.message || 'Not found' });
  }
});

router.get(
  '/:id/bids',
  optionalAuth, // so each viewer can see which bids are theirs (is_mine)
  auctionValidator.validateAuctionId,
  handleValidationErrors,
  auctionController.getAuctionBids
);

/**
 * @route   POST /api/v1/auctions
 * @desc    Create a new auction
 * @access  Private (Sellers only)
 */
router.post(
  '/',
  authenticate,
  sellerOnly,
  auctionValidator.validateCreateAuction,
  handleValidationErrors,
  auctionController.createAuction
);

/**
 * @route   PUT /api/v1/auctions/:id
 * @desc    Update auction
 * @access  Private (Sellers only - own auctions)
 */
router.put(
  '/:id',
  authenticate,
  sellerOnly,
  auctionValidator.validateUpdateAuction,
  handleValidationErrors,
  auctionController.updateAuction
);

/**
 * @route   POST /api/v1/auctions/:id/cancel
 * @desc    Cancel auction
 * @access  Private (Sellers only - own auctions)
 */
router.post(
  '/:id/cancel',
  authenticate,
  sellerOnly,
  auctionValidator.validateAuctionId,
  handleValidationErrors,
  auctionController.cancelAuction
);

export default router;
