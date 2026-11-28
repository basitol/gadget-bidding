import { Router, Request, Response, NextFunction } from 'express';
import * as gadgetController from '../controllers/gadget.controller';
import * as listingController from '../controllers/listing.controller';
import * as gadgetValidator from '../validators/gadget.validator';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import {
  authenticate,
  sellerOnly,
  adminOnly,
  requireSellerKyb,
  optionalAuth,
} from '../middlewares/auth.middleware';
import { uploadGadgetImages } from '../middlewares/upload.middleware';
import { uploadRateLimiter, deviceCheckRateLimiter } from '../middlewares/security.middleware';
import { sendError } from '../../utils/response';
import config from '../../config';

const router: Router = Router();

/**
 * @route   GET /api/v1/gadgets/categories
 * @desc    Get all gadget categories
 * @access  Public
 */
router.get('/categories', gadgetController.getCategories);

/**
 * @route   POST /api/v1/gadgets/upload-images
 * @desc    Upload gadget photos (local device images)
 * @access  Private (Sellers only)
 */
router.post(
  '/upload-images',
  authenticate,
  sellerOnly,
  uploadRateLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    uploadGadgetImages(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      const uploadError = err as { code?: string; message?: string };
      if (uploadError.code === 'LIMIT_FILE_SIZE') {
        return sendError(res, 'Each image must be 5MB or smaller', 400);
      }
      // multer reports one image over .array('images', max) as LIMIT_UNEXPECTED_FILE.
      if (uploadError.code === 'LIMIT_FILE_COUNT' || uploadError.code === 'LIMIT_UNEXPECTED_FILE') {
        return sendError(res, `Add up to ${config.maxImagesPerGadget} photos at a time.`, 400);
      }
      return sendError(res, uploadError.message || 'Image upload failed', 400);
    });
  },
  gadgetController.uploadImages
);

/* ---- "List a gadget" flow (declared before /:id) ---- */

/**
 * @route   GET /api/v1/gadgets/listing-config
 * @desc    Fee, auction lengths, photo limit, minimum start price, whether serial lookup is on
 * @access  Private (Sellers only)
 */
router.get('/listing-config', authenticate, sellerOnly, listingController.getListingConfig);

/**
 * @route   GET /api/v1/gadgets/models?q=&category=
 * @desc    Model search for step 1 (best matches first, max 12)
 * @access  Private (Sellers only)
 */
router.get('/models', authenticate, sellerOnly, listingController.getModels);

/**
 * @route   POST /api/v1/gadgets/device-check
 * @desc    Check an IMEI / serial: valid, already listed or sold, and (when a provider is set) look it up
 * @access  Private (Sellers only)
 */
router.post('/device-check', authenticate, sellerOnly, deviceCheckRateLimiter, listingController.deviceCheck);

/**
 * @route   GET /api/v1/gadgets/price-hint?profile=&model=&storage=
 * @desc    "Similar items sold for" from our own sales in the last 180 days
 * @access  Private (Sellers only)
 */
router.get('/price-hint', authenticate, sellerOnly, listingController.getPriceHint);

/**
 * @route   GET /api/v1/gadgets/my-listings
 * @desc    Get current user's gadgets
 * @access  Private
 */
router.get('/my-listings', authenticate, gadgetController.getMyGadgets);

/**
 * @route   GET /api/v1/gadgets
 * @desc    Get all gadgets with filters
 * @access  Public
 */
router.get(
  '/',
  gadgetValidator.validateGadgetFilters,
  handleValidationErrors,
  gadgetController.getGadgets
);

/**
 * @route   GET /api/v1/gadgets/:id
 * @desc    Get gadget by ID. Approved / listed / sold: anyone. Pending / rejected: only its seller and admins.
 *          Never includes the IMEI / serial; the hidden lowest price only for its seller and admins.
 * @access  Public (optional auth)
 */
router.get(
  '/:id',
  optionalAuth, // the seller (and our team) can open their own pending / sent-back listing ("Fix listing")
  gadgetValidator.validateGadgetId,
  handleValidationErrors,
  gadgetController.getGadgetById
);

/**
 * @route   POST /api/v1/gadgets
 * @desc    Create a new gadget. A body with `profile` is the listing flow (listing.service.ts);
 *          without it, the old body and validators.
 * @access  Private (Sellers only)
 */
router.post(
  '/',
  authenticate,
  sellerOnly,
  requireSellerKyb,
  gadgetValidator.forLegacyBody(gadgetValidator.validateCreateGadget),
  gadgetController.createGadget
);

/**
 * @route   PUT /api/v1/gadgets/:id
 * @desc    Update gadget
 * @access  Private (Sellers only - own gadgets)
 */
router.put(
  '/:id',
  authenticate,
  sellerOnly,
  gadgetValidator.validateGadgetId,
  handleValidationErrors,
  gadgetValidator.forLegacyBody(gadgetValidator.validateUpdateGadget),
  gadgetController.updateGadget
);

/**
 * @route   DELETE /api/v1/gadgets/:id
 * @desc    Delete gadget
 * @access  Private (Sellers only - own gadgets)
 */
router.delete(
  '/:id',
  authenticate,
  sellerOnly,
  gadgetValidator.validateGadgetId,
  handleValidationErrors,
  gadgetController.deleteGadget
);

/**
 * @route   POST /api/v1/gadgets/:id/approve
 * @desc    Approve gadget (admin only)
 * @access  Private (Admin)
 */
router.post(
  '/:id/approve',
  authenticate,
  adminOnly,
  gadgetValidator.validateGadgetId,
  handleValidationErrors,
  gadgetController.approveGadget
);

/**
 * @route   POST /api/v1/gadgets/:id/reject
 * @desc    Reject gadget (admin only)
 * @access  Private (Admin)
 */
router.post(
  '/:id/reject',
  authenticate,
  adminOnly,
  gadgetValidator.validateAdminReview,
  handleValidationErrors,
  gadgetController.rejectGadget
);

export default router;
