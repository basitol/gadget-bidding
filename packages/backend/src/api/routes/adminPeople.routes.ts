import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, adminOnly } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { adminMutationRateLimiter } from '../middlewares/security.middleware';
import { sendError, sendSuccess } from '../../utils/response';
import logger from '../../utils/logger';
import * as people from '../../services/admin/people.service';

/**
 * Users (admin), mounted at /api/v1/admin:
 *   GET  /people/stats
 *   GET  /people?tab=buyers|sellers|suspended&search=&page=
 *   GET  /people/buyers/:id  (+ /orders, /bids, /disputes)
 *   GET  /people/sellers/:id (+ /listings, /payouts)
 *   GET  /people/:id/notes · POST /people/:id/notes { body }
 *   GET  /people/:id/restriction-preview?kind=suspend|pause_listings
 *   GET  /people/:id/email-preview?kind=suspend|pause_listings|restore&reason=&duration=
 *   POST /people/:id/suspend { reason, duration: 7d|30d|permanent, note? }
 *   POST /people/:id/pause-listings { reason, duration: until_fixed|30d|close_store, note? }
 *   POST /people/:id/restore { reason: served|mistake|appeal, note? }
 *   POST /people/:id/password-reset
 *   POST /restrictions/:id/approve · POST /restrictions/:id/decline (a second admin)
 */
const router: Router = Router();
router.use(authenticate, adminOnly);

const run =
  (fn: (req: Request) => Promise<unknown>, message?: string) =>
  async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await fn(req), message);
    } catch (error: any) {
      if (error instanceof people.PeopleError) return sendError(res, error.message, error.status);
      logger.error('Admin people error:', error);
      sendError(res, 'That didn’t work. Try again.', 500);
    }
  };

const admin = (req: Request) => req.user!.user_id;
const id = param('id').isUUID().withMessage('That link isn’t right.');
const LIMIT = 20;

router.get('/people/stats', run(req => people.peopleStats(admin(req))));

router.get(
  '/people',
  [
    query('tab').isIn(['buyers', 'sellers', 'suspended']),
    query('search').optional().isString().isLength({ max: 100 }),
    query('page').optional().isInt({ min: 1 }),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const page = Number(req.query.page ?? 1);
      const { items, total } = await people.listPeople(admin(req), req.query.tab as 'buyers' | 'sellers' | 'suspended', {
        search: req.query.search as string | undefined,
        page,
        limit: LIMIT,
      });
      res.json({ success: true, data: items, pagination: { page, limit: LIMIT, total, totalPages: Math.max(1, Math.ceil(total / LIMIT)) } });
    } catch (error: any) {
      logger.error('Admin people list error:', error);
      sendError(res, 'Couldn’t load people. Try again.', 500);
    }
  }
);

router.get('/people/buyers/:id', [id], handleValidationErrors, run(req => people.buyerDetail(req.params.id as string)));
router.get('/people/buyers/:id/orders', [id], handleValidationErrors, run(req => people.buyerOrders(req.params.id as string)));
router.get('/people/buyers/:id/bids', [id], handleValidationErrors, run(req => people.buyerBids(req.params.id as string)));
router.get('/people/buyers/:id/disputes', [id], handleValidationErrors, run(req => people.buyerDisputes(req.params.id as string)));
router.get('/people/sellers/:id', [id], handleValidationErrors, run(req => people.sellerDetail(req.params.id as string)));
router.get('/people/sellers/:id/listings', [id], handleValidationErrors, run(req => people.sellerListings(req.params.id as string)));
router.get('/people/sellers/:id/payouts', [id], handleValidationErrors, run(req => people.sellerPayouts(req.params.id as string)));

router.get('/people/:id/notes', [id], handleValidationErrors, run(req => people.listNotes(req.params.id as string)));
router.post(
  '/people/:id/notes',
  adminMutationRateLimiter,
  [id, body('body').isString().isLength({ min: 1, max: 1000 }).withMessage('Write the note first.')],
  handleValidationErrors,
  run(req => people.addNote(admin(req), req.params.id as string, req.body.body), 'Note saved')
);

router.get(
  '/people/:id/restriction-preview',
  [id, query('kind').isIn(['suspend', 'pause_listings'])],
  handleValidationErrors,
  run(req => people.restrictionPreview(admin(req), req.params.id as string, req.query.kind as 'suspend' | 'pause_listings'))
);
router.get(
  '/people/:id/email-preview',
  [
    id,
    query('kind').isIn(['suspend', 'pause_listings', 'restore']),
    query('reason').optional().isString().isLength({ max: 30 }),
    query('duration').optional().isString().isLength({ max: 20 }),
  ],
  handleValidationErrors,
  run(req =>
    people.emailPreview(
      req.params.id as string,
      req.query.kind as 'suspend' | 'pause_listings' | 'restore',
      String(req.query.reason ?? ''),
      req.query.duration as string | undefined
    )
  )
);

router.post('/people/:id/suspend', adminMutationRateLimiter, [id], handleValidationErrors, run(req => people.suspendBuyer(admin(req), req.params.id as string, req.body ?? {}), 'Suspended'));
router.post(
  '/people/:id/pause-listings',
  adminMutationRateLimiter,
  [id],
  handleValidationErrors,
  run(req => people.pauseSellerListings(admin(req), req.params.id as string, req.body ?? {}))
);
router.post('/people/:id/restore', adminMutationRateLimiter, [id], handleValidationErrors, run(req => people.restorePerson(admin(req), req.params.id as string, req.body ?? {}), 'Restored'));
router.post('/people/:id/password-reset', adminMutationRateLimiter, [id], handleValidationErrors, run(req => people.sendPasswordReset(req.params.id as string), 'Reset code sent'));

router.post('/restrictions/:id/approve', adminMutationRateLimiter, [id], handleValidationErrors, run(req => people.approveRestriction(admin(req), req.params.id as string), 'Approved'));
router.post('/restrictions/:id/decline', adminMutationRateLimiter, [id], handleValidationErrors, run(req => people.declineRestriction(admin(req), req.params.id as string), 'Declined'));

export default router;
