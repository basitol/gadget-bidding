import { Router } from 'express';
import { body, param, query } from 'express-validator';
import * as supportController from '../controllers/support.controller';
import { authenticate, sellerOnly } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { authRateLimiter } from '../middlewares/security.middleware';

const router: Router = Router();

router.use(authenticate, sellerOnly);

router.get('/thread', supportController.getMyThread);

router.get(
  '/threads/:id/messages',
  [
    param('id').isUUID(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  handleValidationErrors,
  supportController.getMessages
);

router.post(
  '/threads/:id/messages',
  authRateLimiter,
  [
    param('id').isUUID(),
    body('body').isString().trim().isLength({ min: 1, max: 2000 }),
  ],
  handleValidationErrors,
  supportController.sendMessage
);

export default router;
