import { Router, Request, Response } from 'express';
import { param } from 'express-validator';
import { authenticate, optionalAuth } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { notificationMutationRateLimiter } from '../middlewares/security.middleware';
import { sendSuccess, sendError } from '../../utils/response';
import * as storeService from '../../services/buyer/store.service';

/** /api/v1/stores/:sellerId — seller store as buyers see it. */
const router: Router = Router();
const id = [param('sellerId').isUUID().withMessage('Invalid store'), handleValidationErrors];

const handle =
  (fn: (req: Request) => Promise<unknown>, status = 400) =>
  async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await fn(req));
    } catch (error: any) {
      sendError(res, error?.message || 'Something went wrong', error?.message === 'Store not found' ? 404 : status);
    }
  };

const uid = (req: Request) => (req as any).user?.user_id as string | undefined;

router.get('/:sellerId', optionalAuth, ...id, handle(req => storeService.profile(req.params.sellerId as string, uid(req))));
router.get('/:sellerId/auctions', ...id, handle(req => storeService.liveAuctions(req.params.sellerId as string)));
router.get('/:sellerId/reviews', ...id, handle(req => storeService.reviews(req.params.sellerId as string)));
router.put(
  '/:sellerId/follow',
  notificationMutationRateLimiter,
  authenticate,
  ...id,
  handle(req => storeService.follow(uid(req)!, req.params.sellerId as string))
);
router.delete(
  '/:sellerId/follow',
  notificationMutationRateLimiter,
  authenticate,
  ...id,
  handle(req => storeService.unfollow(uid(req)!, req.params.sellerId as string))
);

export default router;
