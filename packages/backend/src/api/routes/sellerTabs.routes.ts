import { Router, Request, Response } from 'express';
import { query } from 'express-validator';
import { authenticate, sellerOnly } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { sendError, sendSuccess } from '../../utils/response';
import * as tabs from '../../services/seller/sellerTabs.service';
import { listSellerNotifications, FeedFilter } from '../../services/seller/sellerAlerts';
import { getSellerOrder, SellerOrderError } from '../../services/seller/sellerOrder.service';
import logger from '../../utils/logger';

/** The seller app's Home, My listings and Orders tabs. Mounted at /api/v1/seller. */
const router: Router = Router();

const run = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    sendSuccess(res, await fn(req));
  } catch (error: any) {
    sendError(res, error.message || "Couldn't load this right now", 500);
  }
};

router.get('/home', authenticate, sellerOnly, run(req => tabs.getSellerHome(req.user!.user_id)));

router.get(
  '/listings',
  authenticate,
  sellerOnly,
  [query('tab').optional().isIn(['live', 'review', 'changes', 'unsold'])],
  handleValidationErrors,
  run(req => tabs.getSellerListings(req.user!.user_id, ((req.query.tab as string) || 'live') as tabs.ListingTab))
);

router.get(
  '/orders',
  authenticate,
  sellerOnly,
  [query('tab').optional().isIn(['todo', 'progress', 'done'])],
  handleValidationErrors,
  run(req => tabs.getSellerOrders(req.user!.user_id, ((req.query.tab as string) || 'todo') as 'todo' | 'progress' | 'done'))
);

router.get(
  '/notifications',
  authenticate,
  sellerOnly,
  [query('filter').optional().isIn(['all', 'sales', 'listings', 'money'])],
  handleValidationErrors,
  run(req => listSellerNotifications(req.user!.user_id, ((req.query.filter as string) || 'all') as FeedFilter))
);

router.get('/dropoff-codes', authenticate, sellerOnly, run(req => tabs.getDropoffCodes(req.user!.user_id)));

/**
 * GET /seller/orders/:id — one of the seller's own orders: stage, step times, money (stored fee and
 * payout), payout and case. Never the buyer's name, phone, email or street (city and state only).
 */
router.get('/orders/:id', authenticate, sellerOnly, async (req: Request, res: Response) => {
  try {
    sendSuccess(res, await getSellerOrder(req.user!.user_id, String(req.params.id)));
  } catch (error: any) {
    if (error instanceof SellerOrderError) return sendError(res, error.message, error.status);
    logger.error('Seller order detail error:', error);
    sendError(res, "We couldn't load this order. Try again.", 500);
  }
});

export default router;
