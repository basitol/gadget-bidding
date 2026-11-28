import { Router, Request, Response } from 'express';
import { authenticate, sellerOnly } from '../middlewares/auth.middleware';
import { sendError, sendSuccess } from '../../utils/response';
import logger from '../../utils/logger';
import * as payouts from '../../services/seller/payouts.service';

/** The seller app's Payouts tab (and the payout card on Home). Mounted at /api/v1/seller/payouts. */
const router: Router = Router();

/**
 * GET /seller/payouts
 * What's ready, what's in escrow, when the next 6 pm payout is, where it goes, and past payouts.
 */
router.get('/', authenticate, sellerOnly, async (req: Request, res: Response) => {
  try {
    sendSuccess(res, await payouts.getSellerSummary(req.user!.user_id));
  } catch (error) {
    if (error instanceof payouts.PayoutError) return sendError(res, error.message, error.status);
    logger.error('Seller payouts summary error:', error);
    sendError(res, "We couldn't load your payouts. Try again.", 500);
  }
});

const fail = (res: Response, error: unknown, what: string) => {
  if (error instanceof payouts.PayoutError) {
    return res.status(error.status).json({ success: false, error: error.message, code: error.code });
  }
  logger.error(`Seller payout ${what} error:`, error);
  return sendError(res, `We couldn't ${what} right now. Try again.`, 500);
};

/**
 * GET /seller/payouts/:id
 * One payout: status, amount, where it went, the bank reference, its orders, charges and totals.
 */
router.get('/:id', authenticate, sellerOnly, async (req: Request, res: Response) => {
  try {
    sendSuccess(res, await payouts.getSellerPayout(req.user!.user_id, String(req.params.id)));
  } catch (error) {
    fail(res, error, 'load this payout');
  }
});

/**
 * POST /seller/payouts/:id/statement
 * Emails the seller a plain statement of this payout, to their account email. → { sent_to }
 */
router.post('/:id/statement', authenticate, sellerOnly, async (req: Request, res: Response) => {
  try {
    const r = await payouts.emailStatement(req.user!.user_id, String(req.params.id));
    sendSuccess(res, r, `Statement sent to ${r.sent_to}`);
  } catch (error) {
    fail(res, error, 'send the statement');
  }
});

export default router;
