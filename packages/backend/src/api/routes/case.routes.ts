import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { notificationMutationRateLimiter } from '../middlewares/security.middleware';
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
router.post(
  '/:id/second-review',
  notificationMutationRateLimiter,
  ...id,
  handle((req, uid) => caseService.askSecondReview(uid, req.params.id), "We'll take another look")
);

export default router;
