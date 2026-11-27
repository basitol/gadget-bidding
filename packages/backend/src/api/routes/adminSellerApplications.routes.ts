import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, adminOnly } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { adminMutationRateLimiter } from '../middlewares/security.middleware';
import { recordAuditEventSafe } from '../../services/audit/audit.service';
import { sendError, sendSuccess } from '../../utils/response';
import * as applications from '../../services/seller/sellerApplication.service';

/** Our verification team's queue of seller applications. Mounted at /api/v1/admin/seller-applications. */
const router: Router = Router();
router.use(authenticate, adminOnly);

const act =
  (fn: (req: Request) => Promise<unknown>, audit?: { action: string; changes?: (req: Request) => Record<string, unknown> }, message?: string) =>
  async (req: Request, res: Response) => {
    try {
      const result = await fn(req);
      if (audit) {
        recordAuditEventSafe({
          req,
          action: audit.action,
          resourceType: 'seller_application',
          resourceId: req.params.id as string,
          changes: (audit.changes?.(req) ?? {}) as Record<string, string | null>,
        });
      }
      sendSuccess(res, result, message);
    } catch (error: any) {
      sendError(res, error.message || 'That didn’t work. Try again.', 400);
    }
  };

const id = param('id').isUUID();

router.get(
  '/',
  [
    query('status').optional().isIn(['in_review', 'needs_info', 'approved', 'rejected', 'draft', 'all']),
    query('page').optional().isInt({ min: 1 }),
    query('search').optional().isString().isLength({ max: 100 }),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const page = Number(req.query.page ?? 1);
      const limit = 30;
      const data = await applications.listForTeam({
        status: (req.query.status as applications.TeamStatusFilter) ?? 'in_review',
        search: req.query.search as string | undefined,
        page,
        limit,
      });
      res.json({
        success: true,
        data: data.items,
        counts: data.counts,
        pagination: { page, limit, total: data.total, totalPages: Math.ceil(data.total / limit) },
      });
    } catch (error: any) {
      sendError(res, error.message || "Couldn't load applications", 500);
    }
  }
);

router.get('/:id', [id], handleValidationErrors, act(req => applications.getForTeam(req.params.id as string)));

router.post(
  '/:id/number-check',
  adminMutationRateLimiter,
  [id, body('result').isIn(['matched', 'not_matched'])],
  handleValidationErrors,
  act(req => applications.setNumberCheck(req.user!.user_id, req.params.id as string, req.body.result), {
    action: 'seller_application_number_check',
    changes: req => ({ result: req.body.result }),
  })
);

router.post(
  '/:id/documents/:kind',
  adminMutationRateLimiter,
  [
    id,
    param('kind').isIn([...applications.DOCUMENT_KINDS]),
    body('status').isIn(['accepted', 'needs_fix']),
    body('note').optional({ nullable: true }).isString().isLength({ max: 300 }),
  ],
  handleValidationErrors,
  act(
    req =>
      applications.reviewDocument(req.user!.user_id, req.params.id as string, req.params.kind as applications.DocumentKind, {
        status: req.body.status,
        note: req.body.note,
      }),
    { action: 'seller_application_document', changes: req => ({ kind: req.params.kind, status: req.body.status, note: req.body.note ?? null }) }
  )
);

router.post(
  '/:id/approve',
  adminMutationRateLimiter,
  [id],
  handleValidationErrors,
  act(req => applications.approveApplication(req.user!.user_id, req.params.id as string), { action: 'seller_application_approve' }, 'Seller approved')
);

router.post(
  '/:id/needs-info',
  adminMutationRateLimiter,
  [id, body('note').isString().isLength({ min: 10, max: 500 }).withMessage('Write a short note for the seller.')],
  handleValidationErrors,
  act(
    req => applications.requestMoreInfo(req.user!.user_id, req.params.id as string, req.body.note),
    { action: 'seller_application_needs_info', changes: req => ({ note: req.body.note }) },
    'Sent back to the seller'
  )
);

router.post(
  '/:id/reject',
  adminMutationRateLimiter,
  [id, body('reason').isString().isLength({ min: 10, max: 1000 }).withMessage('Give the seller a reason.')],
  handleValidationErrors,
  act(
    req => applications.rejectApplication(req.user!.user_id, req.params.id as string, req.body.reason),
    { action: 'seller_application_reject', changes: req => ({ reason: req.body.reason }) },
    'Application turned down'
  )
);

export default router;
