import { Router, Request, Response } from 'express';
import { param } from 'express-validator';
import { authenticate, adminOnly } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { adminMutationRateLimiter } from '../middlewares/security.middleware';
import { sendError, sendSuccess } from '../../utils/response';
import logger from '../../utils/logger';
import { CloseStoreError, getStoreStatusForTeam, reopenStore } from '../../services/seller/closeStore.service';

/**
 * A seller's store, for our team: closed or open, and "Reopen store".
 * Mount at /api/v1/admin/sellers (before the general /admin router).
 */
const router: Router = Router();
router.use(authenticate, adminOnly);

const fail = (res: Response, error: unknown) => {
  if (error instanceof CloseStoreError) return sendError(res, error.message, error.status);
  logger.error('Admin seller store failed:', error);
  return sendError(res, 'That didn’t work. Try again.', 500);
};

/** GET /:id/store → { closed_at } */
router.get('/:id/store', [param('id').isUUID()], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    sendSuccess(res, await getStoreStatusForTeam(req.params.id as string));
  } catch (error) {
    fail(res, error);
  }
});

/** POST /:id/reopen-store → { closed_at: null } */
router.post(
  '/:id/reopen-store',
  adminMutationRateLimiter,
  [param('id').isUUID()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await reopenStore(req.params.id as string, req), 'Store reopened');
    } catch (error) {
      fail(res, error);
    }
  }
);

export default router;
