import { NextFunction, Request, Response, Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { authenticate, adminOnly } from '../middlewares/auth.middleware';
import { adminMutationRateLimiter } from '../middlewares/security.middleware';
import * as auditService from '../../services/audit/audit.service';
import * as privacyService from '../../services/buyer/privacy.service';
import { sendError, sendSuccess } from '../../utils/response';
import { adminRouter as appConfigAdminRoutes } from './appConfig.routes';
import { searchEverything } from '../../services/admin/adminSearch.service';

const router: Router = Router();

router.use(authenticate, adminOnly);
router.use(adminMutationRateLimiter);
router.use((req: Request, _res: Response, next: NextFunction) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    auditService.recordAuditEventSafe({
      req,
      action: 'admin_mutation_attempt',
      resourceType: 'admin',
      changes: {
        method: req.method,
        path: req.originalUrl,
        params: req.params,
      },
    });
  }
  next();
});

/** App versions (forced update) and maintenance mode. */
router.use('/app-config', appConfigAdminRoutes);

/** GET /admin/search?q= — orders, people (email, name, phone, seller ID) and listings. */
router.get('/search', async (req: Request, res: Response) => {
  try {
    sendSuccess(res, await searchEverything(String(req.query.q ?? '')));
  } catch (error: any) {
    sendError(res, error?.message || "Search didn't work. Try again.", 500);
  }
});

/**
 * POST /admin/client-errors { reference, page, status, message } — a page in the dashboard couldn't
 * load. Recorded in the audit log so "View audit log" finds it by its reference (GB-PAY-504).
 */
router.post('/client-errors', async (req: Request, res: Response) => {
  const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null);
  const reference = clip(req.body?.reference, 40);
  if (!reference || !/^GB-[A-Z]{2,6}-[A-Z0-9]{3}$/.test(reference)) return sendError(res, 'Send the error reference.', 400);
  await auditService.recordAuditEvent({
    req,
    action: 'page_load_error',
    resourceType: 'page',
    changes: {
      reference,
      page: clip(req.body?.page, 120),
      status: typeof req.body?.status === 'number' ? req.body.status : null,
      message: clip(req.body?.message, 300),
    },
  });
  sendSuccess(res, { logged: true });
});

router.get('/stats', adminController.getAdminStats);
router.get('/overview', adminController.getOverview);
router.get('/queues', adminController.getQueues);
router.get('/tasks', adminController.getTasks);
router.get('/rules', adminController.getRules);
router.get('/launch-checklist', adminController.getLaunchChecklist);
router.get('/activity', adminController.getActivity);

router.get('/gadgets', adminController.getGadgets);
router.get('/gadgets/pending', adminController.getPendingGadgets);
router.get('/gadgets/:id', adminController.getGadgetReview);
router.post('/gadgets/:id/approve', adminController.approveGadget);
router.post('/gadgets/:id/reject', adminController.rejectGadget);

router.get('/auctions', adminController.getAuctions);
router.post('/auctions/:id/cancel', adminController.cancelAuction);

router.get('/orders', adminController.getAllOrders);
router.patch('/orders/:id', adminController.updateOrder);
/** Hub inspection: the 7-point checklist, and recording an order's result. */
router.get('/inspection-checks', adminController.getInspectionChecks);
router.post('/orders/:id/inspection', adminController.recordInspection);
router.post(
  '/orders/:id/second-place-offer',
  adminController.createSecondPlaceOffer
);

router.get('/users', adminController.getUsers);
router.get('/users/:id/seller-profile', adminController.getSellerProfile);
router.patch('/users/:id', adminController.updateUser);
router.post(
  '/users/:id/reactivate',
  adminController.reactivateUserAfterPenalty
);

router.get('/sellers/kyb-pending', adminController.getPendingSellerKyb);
router.post('/sellers/:id/kyb/approve', adminController.approveSellerKyb);
router.post('/sellers/:id/kyb/reject', adminController.rejectSellerKyb);

router.get('/disputes', adminController.getDisputes);
router.patch('/disputes/:id', adminController.resolveDispute);
router.get('/disputes/:id', adminController.getDisputeCase);
router.post('/disputes/:id/messages', adminController.postDisputeMessage);
router.put('/disputes/:id/next-step', adminController.setDisputeNextStep);
router.post('/disputes/:id/decision', adminController.decideDispute);
router.post('/disputes/:id/return-received', adminController.markDisputeReturnReceived);
router.put('/disputes/:id/hub-findings', adminController.setDisputeHubFindings);
router.post('/disputes/:id/returned-to-seller', adminController.markDisputeReturnedToSeller);

router.get('/payments', adminController.getPayments);
router.get('/audit-logs', adminController.getAuditLogs);

router.get('/support/threads', adminController.getSupportThreads);
router.get('/support/threads/:id/messages', adminController.getSupportMessages);
router.post(
  '/support/threads/:id/messages',
  adminController.replySupportThread
);
router.post('/support/threads/:id/close', adminController.closeSupportThread);

/** "Download my data" requests from Privacy & your data: email the file, then mark it sent. */
router.get('/data-requests', async (req: Request, res: Response) => {
  try {
    sendSuccess(res, await privacyService.listDataRequests(String(req.query.status || 'open')));
  } catch (error: any) {
    sendError(res, error.message || 'Failed to load data requests', 500);
  }
});
router.post('/data-requests/:id/sent', async (req: Request, res: Response) => {
  try {
    sendSuccess(res, await privacyService.markDataRequestSent(req.params.id, req.user!.user_id, req), 'Marked as sent');
  } catch (error: any) {
    sendError(res, error.message || 'Failed to update the request', 400);
  }
});

export default router;
