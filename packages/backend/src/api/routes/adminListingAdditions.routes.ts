import { Router, Request, Response } from 'express';
import { authenticate, adminOnly } from '../middlewares/auth.middleware';
import { adminMutationRateLimiter } from '../middlewares/security.middleware';
import { sendError, sendSuccess } from '../../utils/response';
import logger from '../../utils/logger';
import * as auditService from '../../services/audit/audit.service';
import * as manage from '../../services/seller/listingManage.service';

/**
 * Our team checks photos and bidder notes sellers add to live listings (/api/v1/admin/listing-additions):
 *   GET  /                    listings with something waiting
 *   POST /:gadgetId/decide    { approve_photos?, reject_photos?, note?: approve|reject, reason? }
 */
const router: Router = Router();
router.use(authenticate, adminOnly);

router.get('/', async (_req: Request, res: Response) => {
  try {
    sendSuccess(res, await manage.listPendingAdditions());
  } catch (error) {
    logger.error('Listing additions list error:', error);
    sendError(res, 'We couldn’t load these. Try again.', 500);
  }
});

router.post('/:gadgetId/decide', adminMutationRateLimiter, async (req: Request, res: Response) => {
  try {
    const result = await manage.decideAdditions(String(req.params.gadgetId), req.body ?? {});
    auditService.recordAuditEventSafe({
      req,
      action: 'listing_additions_decided',
      resourceType: 'gadget',
      resourceId: String(req.params.gadgetId),
      changes: { ...result, reason: typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 300) : null },
    });
    sendSuccess(res, result, 'Saved');
  } catch (error: any) {
    if (error instanceof manage.ManageError) return sendError(res, error.message, error.status);
    logger.error('Listing additions decide error:', error);
    sendError(res, 'That didn’t work. Try again.', 500);
  }
});

export default router;
