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

export default router;
