import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate, sellerOnly } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { authRateLimiter } from '../middlewares/security.middleware';
import { sendError, sendSuccess } from '../../utils/response';
import logger from '../../utils/logger';
import { CloseStoreError, closeStore, getCloseChecklist } from '../../services/seller/closeStore.service';

/** Store › Close my store. Mounted at /api/v1/seller/close. */
const router: Router = Router();
router.use(authenticate, sellerOnly);

const fail = (res: Response, error: unknown) => {
  if (error instanceof CloseStoreError) return sendError(res, error.message, error.status);
  logger.error('Close store failed:', error);
  return sendError(res, 'That didn’t work. Try again.', 500);
};

/** What has to finish before the store can close. */
router.get('/', async (req: Request, res: Response) => {
  try {
    sendSuccess(res, await getCloseChecklist(req.user!.user_id));
  } catch (error) {
    fail(res, error);
  }
});

/** { password } → closes the store (refused while anything is still in progress). */
router.post(
  '/',
  authRateLimiter,
  [body('password').isString().isLength({ min: 1, max: 200 }).withMessage('Enter your password.')],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await closeStore(req.user!.user_id, String(req.body.password), req), 'Your store is closed');
    } catch (error) {
      fail(res, error);
    }
  }
);

export default router;
