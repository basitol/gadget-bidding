import { Router, Request, Response } from 'express';
import { authenticate, sellerOnly } from '../middlewares/auth.middleware';
import { sendError, sendSuccess } from '../../utils/response';
import { getListingPause, ListingPauseError, requestListingReview } from '../../services/seller/listingPause.service';
import { recordAuditEventSafe } from '../../services/audit/audit.service';
import logger from '../../utils/logger';

/** Why new listings are paused, and asking our team to review it (/seller/listing-pause). */
const router: Router = Router();

const fail = (res: Response, e: unknown, what: string) => {
  if (e instanceof ListingPauseError) return sendError(res, e.message, e.status);
  logger.error(`${what}:`, e);
  return sendError(res, 'Something went wrong. Try again.', 500);
};

/** GET /seller/listing-pause — paused or not, why, and which sales counted. */
router.get('/', authenticate, sellerOnly, async (req: Request, res: Response) => {
  try {
    sendSuccess(res, await getListingPause(req.user!.user_id));
  } catch (e) {
    fail(res, e, 'Listing pause');
  }
});

/** POST /seller/listing-pause/review — ask our team to look at it (once a day). */
router.post('/review', authenticate, sellerOnly, async (req: Request, res: Response) => {
  try {
    const before = await getListingPause(req.user!.user_id);
    const view = await requestListingReview(req.user!.user_id);
    if (view.review_requested_at !== before.review_requested_at) {
      recordAuditEventSafe({
        req,
        action: 'listing_review_requested',
        resourceType: 'user',
        resourceId: req.user!.user_id,
        changes: { code: view.code, failed: view.failed.length },
      });
    }
    sendSuccess(res, view, 'We’ve asked our team to review it.');
  } catch (e) {
    fail(res, e, 'Request listing review');
  }
});

export default router;
