import { NextFunction, Request, Response, Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { authenticate, adminOnly } from '../middlewares/auth.middleware';
import { adminMutationRateLimiter } from '../middlewares/security.middleware';
import * as auditService from '../../services/audit/audit.service';

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

router.get('/stats', adminController.getAdminStats);
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

router.get('/payments', adminController.getPayments);
router.get('/audit-logs', adminController.getAuditLogs);

router.get('/support/threads', adminController.getSupportThreads);
router.get('/support/threads/:id/messages', adminController.getSupportMessages);
router.post(
  '/support/threads/:id/messages',
  adminController.replySupportThread
);
router.post('/support/threads/:id/close', adminController.closeSupportThread);

export default router;
