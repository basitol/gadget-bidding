import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, adminOnly } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { adminMutationRateLimiter } from '../middlewares/security.middleware';
import { recordAuditEventSafe } from '../../services/audit/audit.service';
import { sendError, sendSuccess } from '../../utils/response';
import logger from '../../utils/logger';
import * as payouts from '../../services/seller/payouts.service';

/**
 * Our team's view of the 6 pm seller payouts (one per seller per run).
 * Mounted at /api/v1/admin/seller-payouts.
 */
const router: Router = Router();
router.use(authenticate, adminOnly);

const fail = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof payouts.PayoutError) return sendError(res, error.message, error.status);
  logger.error(`${fallback}:`, error);
  sendError(res, fallback, 500);
};

/** GET /admin/seller-payouts?status=sending|paid|failed|all&search=&page= */
router.get(
  '/',
  [
    query('status').optional().isIn(['sending', 'paid', 'failed', 'all']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString().isLength({ max: 100 }),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 20);
      const data = await payouts.listForTeam({
        status: (req.query.status as payouts.TeamPayoutStatus) ?? 'sending',
        search: req.query.search as string | undefined,
        page,
        limit,
      });
      res.json({
        success: true,
        data: data.items,
        counts: data.counts,
        sending_amount: data.sending_amount,
        automatic: data.automatic,
        next_run_at: data.next_run_at,
        pagination: { page, limit, total: data.total, totalPages: Math.max(1, Math.ceil(data.total / limit)) },
      });
    } catch (error) {
      fail(res, error, "Couldn't load seller payouts");
    }
  }
);

router.get('/:id', [param('id').isUUID()], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    sendSuccess(res, await payouts.getForTeam(req.params.id as string));
  } catch (error) {
    fail(res, error, "Couldn't load this payout");
  }
});

/** POST /admin/seller-payouts/:id/mark-paid { bank_reference } — we sent it by hand. */
router.post(
  '/:id/mark-paid',
  adminMutationRateLimiter,
  [
    param('id').isUUID(),
    body('bank_reference')
      .isString()
      .trim()
      .isLength({ min: 4, max: 100 })
      .withMessage('Enter the bank reference for the transfer you made.'),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const row = await payouts.markPaidByTeam(req.user!.user_id, req.params.id as string, req.body.bank_reference);
      recordAuditEventSafe({
        req,
        action: 'seller_payout_marked_paid',
        resourceType: 'seller_payout',
        resourceId: row.id,
        changes: {
          reference: row.reference,
          amount: row.amount,
          bank_reference: String(req.body.bank_reference).trim(),
          seller_id: row.seller.id,
          account: `${row.bank_name ?? ''} ••••${row.account_last4 ?? ''}`.trim(),
          orders: row.orders.map(o => o.order_number),
        },
      });
      sendSuccess(res, row, `${row.reference} marked paid`);
    } catch (error) {
      fail(res, error, "Couldn't mark this payout paid");
    }
  }
);

/** POST /admin/seller-payouts/:id/mark-failed { reason } — its orders go in the next 6 pm payout. */
router.post(
  '/:id/mark-failed',
  adminMutationRateLimiter,
  [
    param('id').isUUID(),
    body('reason').isString().trim().isLength({ min: 5, max: 500 }).withMessage('Say why it didn’t go through (5+ characters).'),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      // The orders leave the payout when it fails, so note them first for the audit log.
      const before = await payouts.getForTeam(req.params.id as string);
      const row = await payouts.markFailedByTeam(req.user!.user_id, req.params.id as string, req.body.reason);
      recordAuditEventSafe({
        req,
        action: 'seller_payout_marked_failed',
        resourceType: 'seller_payout',
        resourceId: row.id,
        changes: {
          reference: row.reference,
          amount: row.amount,
          reason: String(req.body.reason).trim(),
          seller_id: row.seller.id,
          orders: before.orders.map(o => o.order_number),
        },
      });
      sendSuccess(res, row, `${row.reference} marked as not gone through`);
    } catch (error) {
      fail(res, error, "Couldn't mark this payout failed");
    }
  }
);

export default router;
