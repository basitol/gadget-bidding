import { Router, Request, Response, NextFunction } from 'express';
import * as gadgetController from '../controllers/gadget.controller';
import * as gadgetValidator from '../validators/gadget.validator';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import {
  authenticate,
  sellerOnly,
  adminOnly,
} from '../middlewares/auth.middleware';
import { uploadGadgetImages } from '../middlewares/upload.middleware';
import { uploadRateLimiter } from '../middlewares/security.middleware';
import { sendError } from '../../utils/response';

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
      if (uploadError.code === 'LIMIT_FILE_COUNT') {
        return sendError(res, 'Too many images uploaded', 400);
      }
      return sendError(res, uploadError.message || 'Image upload failed', 400);
    });
  },
  gadgetController.uploadImages
);

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
 * @desc    Get gadget by ID
 * @access  Public
 */
router.get(
  '/:id',
  gadgetValidator.validateGadgetId,
  handleValidationErrors,
  gadgetController.getGadgetById
);

/**
 * @route   POST /api/v1/gadgets
 * @desc    Create a new gadget
 * @access  Private (Sellers only)
 */
router.post(
  '/',
  authenticate,
  sellerOnly,
  gadgetValidator.validateCreateGadget,
  handleValidationErrors,
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
  gadgetValidator.validateUpdateGadget,
  handleValidationErrors,
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
