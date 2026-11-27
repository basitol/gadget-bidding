import { Router } from 'express';
import { body, param, query } from 'express-validator';
import * as supportController from '../controllers/support.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { supportMessageRateLimiter } from '../middlewares/security.middleware';

/**
 * /api/v1/support — each buyer or seller has their own thread with our team
 * (admin › Support chat). Threads are only ever read by their owner and staff.
 */
const router: Router = Router();

router.use(authenticate);

router.get(
  '/thread',
  [query('order_id').optional().isUUID()],
  handleValidationErrors,
  supportController.getMyThread
);

/**
 * @route   POST /api/v1/support/contact
 * @desc    Help › Contact support: topic, optional order, message (10+ characters).
 *          Lands in the person's own thread with "Topic: … · GV-… · title" on top.
 */
router.post(
  '/contact',
  supportMessageRateLimiter,
  [
    body('topic').isIn(['order', 'paying', 'account', 'other']).withMessage("Choose what it's about."),
    body('order_id').optional({ nullable: true }).isUUID().withMessage('Choose an order from the list.'),
    body('body').isString().withMessage('Write a message first.'),
  ],
  handleValidationErrors,
  supportController.contact
);

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
  supportMessageRateLimiter,
  [
    param('id').isUUID(),
    body('body').isString().trim().isLength({ min: 1, max: 2000 }),
    body('order_id').optional({ values: 'null' }).isUUID(),
  ],
  handleValidationErrors,
  supportController.sendMessage
);

export default router;
