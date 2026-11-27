import { NextFunction, Request, Response, Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { authenticate, adminOnly } from '../middlewares/auth.middleware';
import { adminMutationRateLimiter } from '../middlewares/security.middleware';
import * as auditService from '../../services/audit/audit.service';
import * as privacyService from '../../services/buyer/privacy.service';
import { sendError, sendSuccess } from '../../utils/response';
import { adminRouter as appConfigAdminRoutes } from './appConfig.routes';

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

router.get('/stats', adminController.getAdminStats);
router.get('/overview', adminController.getOverview);
router.get('/queues', adminController.getQueues);
router.get('/tasks', adminController.getTasks);
router.get('/rules', adminController.getRules);
router.get('/launch-checklist', adminController.getLaunchChecklist);
router.get('/activity', adminController.getActivity);

router.get('/gadgets', adminController.getGadgets);
router.get('/gadgets/pending', adminController.getPendingGadgets);
router.post('/gadgets/:id/approve', adminController.approveGadget);
router.post('/gadgets/:id/reject', adminController.rejectGadget);

router.get('/auctions', adminController.getAuctions);
router.post('/auctions/:id/cancel', adminController.cancelAuction);

router.get('/orders', adminController.getAllOrders);
router.patch('/orders/:id', adminController.updateOrder);
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
