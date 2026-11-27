import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, adminOnly } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { recordAuditEventSafe } from '../../services/audit/audit.service';
import * as listingReportService from '../../services/buyer/listingReport.service';

/** Our team's queue of listings buyers reported. Mounted at /api/v1/admin/listing-reports. */
const router: Router = Router();
router.use(authenticate, adminOnly);

router.get(
  '/',
  [query('status').optional().isIn(['open', 'actioned', 'dismissed', 'all']), query('page').optional().isInt({ min: 1 })],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const page = Number(req.query.page ?? 1);
      const data = await listingReportService.listReports((req.query.status as any) ?? 'open', page, 50);
      res.json({ success: true, data: data.items, pagination: { page, limit: 50, total: data.total, totalPages: Math.ceil(data.total / 50) } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || "Couldn't load reports" });
    }
  }
);

router.post(
  '/:id/resolve',
  [param('id').isUUID(), body('status').isIn(['actioned', 'dismissed']), body('note').isString().isLength({ min: 5, max: 1000 })],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const r = await listingReportService.resolveReport(req.user!.user_id, req.params.id as string, req.body.status, req.body.note);
      recordAuditEventSafe({
        req,
        action: 'listing_report_resolved',
        resourceType: 'listing_report',
        resourceId: req.params.id as string,
        changes: { status: req.body.status },
      });
      res.json({ success: true, data: r, message: req.body.status === 'actioned' ? 'Marked as actioned' : 'Report dismissed' });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message || "Couldn't update the report" });
    }
  }
);

export default router;
