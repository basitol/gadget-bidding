import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import * as sellerSummary from '../../services/buyer/sellerSummary.service';
import * as auctionController from '../controllers/auction.controller';
import * as listingReportService from '../../services/buyer/listingReport.service';
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
 * @route   GET /api/v1/auctions/facets?category=smartphones
 * @desc    Live auctions per category, and per brand inside one category
 * @access  Public
 */
router.get('/facets', auctionController.getLiveFacets);

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
  // Signed in or not; knowing who it is keeps the seller's own visits out of their view count.
  optionalAuth,
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

/**
 * @route   POST /api/v1/auctions/:id/relist
 * @desc    Put an unsold gadget up again (same settings, starts now; may lower price or reserve)
 * @access  Private (Sellers only - own auctions)
 */
router.post(
  '/:id/relist',
  authenticate,
  sellerOnly,
  auctionValidator.validateAuctionId,
  body('starting_price').optional().isFloat({ gt: 0 }).toFloat().withMessage('Enter a starting price above ₦0'),
  body('reserve_price').optional({ nullable: true }).isFloat({ gt: 0 }).toFloat().withMessage('Enter a reserve above ₦0'),
  handleValidationErrors,
  auctionController.relistAuction
);

/**
 * @route   POST /api/v1/auctions/:id/report { reason, details? }
 * @desc    Report a listing (stolen, fake, wrong details). Private: the seller never sees who.
 * @access  Private (signed-in buyers)
 */
router.post(
  '/:id/report',
  authenticate,
  auctionValidator.validateAuctionId,
  body('reason').isIn(['stolen', 'fake', 'wrong_details', 'other']).withMessage("Choose what's wrong"),
  body('details').optional({ nullable: true }).isString().isLength({ max: 1000 }).withMessage('Keep it under 1,000 characters'),
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const r = await listingReportService.reportListing(req.user!.user_id, req.params.id as string, req.body.reason, req.body.details);
      res.status(201).json({ success: true, data: r, message: "Thanks. We'll look at it within a day." });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message || "We couldn't send your report. Try again." });
    }
  }
);

export default router;
