import { Router, Request, Response } from 'express';
import { authenticate, adminOnly } from '../middlewares/auth.middleware';
import { adminMutationRateLimiter } from '../middlewares/security.middleware';
import { sendError, sendSuccess } from '../../utils/response';
import logger from '../../utils/logger';
import { recordAuditEventSafe } from '../../services/audit/audit.service';
import * as hub from '../../services/seller/hub.service';

/**
 * Hub desk (/admin/hub): a booked rider collected the item (→ on its way to the hub), and a failed
 * item went back to its seller (collected, or delivered to their shop). Checking items in and
 * recording the check use the existing order endpoints.
 */
const router: Router = Router();
router.use(authenticate, adminOnly);

const act =
  (action: string, fn: (id: string) => Promise<{ id: string; orderNumber?: string; order_number?: string }>, message: string) =>
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    try {
      const out = await fn(id);
      recordAuditEventSafe({
        req,
        action,
        resourceType: 'order',
        resourceId: id,
        changes: { order_number: out.orderNumber ?? out.order_number },
      });
      sendSuccess(res, out, message);
    } catch (error: any) {
      if (error instanceof hub.HubError) return sendError(res, error.message, error.status);
      logger.error(`Admin hub ${action} error:`, error);
      sendError(res, 'That didn’t work. Try again.', 500);
    }
  };

router.post(
  '/orders/:id/rider-collected',
  adminMutationRateLimiter,
  act('hub_rider_collected', hub.markRiderCollected, 'Marked collected. It’s on its way to the hub.')
);
router.post(
  '/orders/:id/handed-back',
  adminMutationRateLimiter,
  act('hub_handed_back', hub.markHandedBack, 'Marked as back with the seller.')
);

export default router;
