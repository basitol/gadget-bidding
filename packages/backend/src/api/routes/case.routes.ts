import path from 'path';
import multer from 'multer';
import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { notificationMutationRateLimiter, uploadRateLimiter } from '../middlewares/security.middleware';
import { uploadCaseVideo, CASE_VIDEO_MAX_MB } from '../middlewares/upload.middleware';
import { sendSuccess, sendError } from '../../utils/response';
import logger from '../../utils/logger';
import * as caseService from '../../services/buyer/case.service';

/**
 * /api/v1/cases — a problem report as the buyer or seller sees it: the thread with our team,
 * the decision, and the return when it's a refund.
 */
const router: Router = Router();
router.use(authenticate);

const handle =
  (fn: (req: Request, userId: string) => Promise<unknown>, okMessage?: string) =>
  async (req: Request, res: Response) => {
    try {
      if (!req.user) return sendError(res, 'User not authenticated', 401);
      sendSuccess(res, await fn(req, req.user.user_id), okMessage);
    } catch (error: any) {
      logger.warn(`${req.method} ${req.originalUrl}: ${error?.message}`);
      sendError(res, error?.message || 'Something went wrong', error?.message === 'Case not found' ? 404 : 400);
    }
  };
const id = [param('id').isUUID().withMessage('Case not found'), handleValidationErrors];

router.get('/:id', ...id, handle((req, uid) => caseService.getCase(uid, req.params.id)));
router.post(
  '/:id/messages',
  notificationMutationRateLimiter,
  ...id,
  body('body').isString().isLength({ min: 1, max: 2000 }).withMessage('Write a message first.'),
  handleValidationErrors,
  handle((req, uid) => caseService.postMessage(uid, req.params.id, req.body.body))
);
router.post(
  '/:id/return',
  notificationMutationRateLimiter,
  ...id,
  body('method').isIn(['dropoff', 'pickup']).withMessage('Choose drop-off or pickup.'),
  handleValidationErrors,
  handle((req, uid) => caseService.startReturn(uid, req.params.id, req.body.method), 'Return started')
);
/** One short video for the report (multipart field "video": mp4/mov, 50 MB, 60 seconds). Buyer only. */
router.post(
  '/:id/video',
  uploadRateLimiter,
  ...id,
  // Check before taking up to 50 MB, so only the buyer of an open case can upload.
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return sendError(res, 'User not authenticated', 401);
      await caseService.checkCanAddVideo(req.user.user_id, req.params.id);
      next();
    } catch (error: any) {
      sendError(res, error?.message || 'Something went wrong', error?.message === 'Case not found' ? 404 : 400);
    }
  },
  (req: Request, res: Response, next: NextFunction) => {
    uploadCaseVideo(req, res, (err: unknown) => {
      if (!err) return next();
      const e = err as { code?: string; message?: string };
      if (e.code === 'LIMIT_FILE_SIZE') return sendError(res, `Keep the video under ${CASE_VIDEO_MAX_MB} MB.`, 400);
      if (e.code === 'LIMIT_FILE_COUNT' || e.code === 'LIMIT_UNEXPECTED_FILE') {
        return sendError(res, 'Add one video at a time.', 400);
      }
      return sendError(res, e.message || "That video didn't upload. Try again.", 400);
    });
  },
  handle(async (req, uid) => {
    if (!req.file) throw new Error('Add a video first.');
    return caseService.addVideo(uid, req.params.id, req.file);
  }, 'Video added')
);
router.post(
  '/:id/second-review',
  notificationMutationRateLimiter,
  ...id,
  handle((req, uid) => caseService.askSecondReview(uid, req.params.id), "We'll take another look")
);

/* ---------------- The seller's side ---------------- */

/** A photo, a short video or a PDF receipt for the seller's reply (one file per request, field "file"). */
const SELLER_FILE_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/x-m4v': '.mp4',
};
const uploadSellerFile = multer({
  storage: multer.diskStorage({
    // Served from /uploads when Cloudinary isn't set up (same as the buyer's video).
    destination: (_req, _file, cb) => cb(null, path.join(process.cwd(), 'uploads')),
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${SELLER_FILE_EXT[(file.mimetype || '').toLowerCase()] || '.bin'}`),
  }),
  fileFilter: (_req, file, cb) => {
    if (SELLER_FILE_EXT[(file.mimetype || '').toLowerCase()]) return cb(null, true);
    cb(new Error('Add a photo, an MP4 or MOV video, or a PDF.'));
  },
  limits: { fileSize: CASE_VIDEO_MAX_MB * 1024 * 1024, files: 1 },
}).single('file');

/** POST { position: 'matched'|'partly', body (30+ characters) } — the seller's side, once. */
router.post(
  '/:id/seller-reply',
  notificationMutationRateLimiter,
  ...id,
  body('position').isIn(['matched', 'partly']).withMessage('Choose whether the item matched your listing.'),
  body('body').isString().trim().isLength({ min: 30, max: 2000 }).withMessage('Explain what happened in at least 30 characters.'),
  handleValidationErrors,
  handle((req, uid) => caseService.sellerReply(uid, req.params.id, req.body.position, req.body.body), 'Reply sent')
);
/** Multipart "file" (+ optional "name"): image or PDF up to 10 MB, or a video up to 60 seconds / 50 MB. Up to 6. */
router.post(
  '/:id/seller-files',
  uploadRateLimiter,
  ...id,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return sendError(res, 'User not authenticated', 401);
      await caseService.checkCanAddSellerFile(req.user.user_id, req.params.id);
      next();
    } catch (error: any) {
      sendError(res, error?.message || 'Something went wrong', error?.message === 'Case not found' ? 404 : 400);
    }
  },
  (req: Request, res: Response, next: NextFunction) => {
    uploadSellerFile(req, res, (err: unknown) => {
      if (!err) return next();
      const e = err as { code?: string; message?: string };
      if (e.code === 'LIMIT_FILE_SIZE') return sendError(res, `Keep files under ${CASE_VIDEO_MAX_MB} MB.`, 400);
      if (e.code === 'LIMIT_FILE_COUNT' || e.code === 'LIMIT_UNEXPECTED_FILE') return sendError(res, 'Add one file at a time.', 400);
      return sendError(res, e.message || "That file didn't upload. Try again.", 400);
    });
  },
  handle(async (req, uid) => {
    if (!req.file) throw new Error('Add a file first.');
    return caseService.addSellerFile(uid, req.params.id, req.file, req.body?.name);
  }, 'File added')
);
/** DELETE { url } — take a file off the reply before it's sent. */
router.delete(
  '/:id/seller-files',
  notificationMutationRateLimiter,
  ...id,
  body('url').isString().isLength({ min: 1, max: 1000 }).withMessage('Which file?'),
  handleValidationErrors,
  handle((req, uid) => caseService.removeSellerFile(uid, req.params.id, req.body.url), 'File removed')
);
router.post(
  '/:id/accept-refund',
  notificationMutationRateLimiter,
  ...id,
  handle((req, uid) => caseService.acceptRefund(uid, req.params.id), 'Return accepted')
);
router.post(
  '/:id/seller-second-review',
  notificationMutationRateLimiter,
  ...id,
  handle((req, uid) => caseService.askSellerSecondReview(uid, req.params.id), "We'll take another look")
);
/** POST { method: 'collect'|'deliver' } — how the seller gets a returned item back. */
router.post(
  '/:id/seller-return',
  notificationMutationRateLimiter,
  ...id,
  body('method').isIn(['collect', 'deliver']).withMessage('Choose collect or delivery.'),
  handleValidationErrors,
  handle((req, uid) => caseService.chooseSellerReturn(uid, req.params.id, req.body.method), 'Saved')
);

export default router;
