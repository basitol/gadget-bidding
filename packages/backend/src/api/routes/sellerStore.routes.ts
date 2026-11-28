import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, sellerOnly } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { notificationMutationRateLimiter } from '../middlewares/security.middleware';
import { sendError, sendSuccess } from '../../utils/response';
import * as store from '../../services/seller/store.service';

/**
 * The seller app's Store tab. Mounted at /api/v1/seller/store.
 *   GET    /              store card + what each row shows
 *   GET    /details       verified (name, code, area) + shop, phone, what you sell, about, hours, away
 *   PUT    /details       { plaza?, shop_number?, business_phone?, categories?: string[], about?: string | null,
 *                            hours?: { mon..sun: { open, close } | null } | null, away?: boolean }
 *   GET    /reviews       ?filter=all|5|4|3_or_less|not_replied — summary, figures, ratings (buyers as "Buyer •••7")
 *   PUT    /reviews/:id/reply  { text } — public reply (≤500), can be changed
 *   GET    /staff         owner + people who can drop off and collect at the hub
 *   POST   /staff         { full_name, email, phone, id_type: nin_slip|drivers_licence|passport|voters_card }
 *                          — emails them an invite to set up their staff sign-in (and texts the hub code)
 *   POST   /staff/:id/invite  send the invite email again (once a minute)
 *   DELETE /staff/:id     their sign-in and hub code stop working
 *   GET    /insights      views, bids, items sold, earnings (30 days, all time) + per listing
 * Documents use /seller/application (GET, POST /documents/:kind); alerts use /notifications/preferences.
 */
const router: Router = Router();
router.use(authenticate, sellerOnly);

const run =
  (fn: (req: Request) => Promise<unknown>, message?: string) =>
  async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await fn(req), message);
    } catch (error: any) {
      const status = error instanceof store.StoreError ? error.status : error?.message === 'Store not found' ? 404 : 400;
      sendError(res, error?.message || 'That didn’t work. Try again.', status);
    }
  };

const uid = (req: Request) => req.user!.user_id;

router.get('/', run(req => store.overview(uid(req))));

router.get('/details', run(req => store.getDetails(uid(req))));
router.put(
  '/details',
  notificationMutationRateLimiter,
  [
    body('about').optional({ nullable: true }).isString().isLength({ max: store.ABOUT_MAX + 50 }),
    body('hours').optional({ nullable: true }).isObject(),
    body('plaza').optional().isString().isLength({ max: 200 }),
    body('shop_number').optional().isString().isLength({ max: 100 }),
    body('business_phone').optional().isString().isLength({ max: 20 }),
    body('categories').optional().isArray({ max: 10 }),
    body('away').optional().isBoolean({ strict: true }).withMessage('Turn away mode on or off.'),
  ],
  handleValidationErrors,
  run(req => store.updateDetails(uid(req), req.body), 'Store details saved')
);

router.get(
  '/reviews',
  [query('filter').optional().isIn([...store.REVIEW_FILTERS])],
  handleValidationErrors,
  run(req => store.reviews(uid(req), req.query.filter))
);
router.put(
  '/reviews/:id/reply',
  notificationMutationRateLimiter,
  [param('id').isUUID(), body('text').isString().isLength({ min: 1, max: store.REPLY_MAX + 50 }).withMessage('Write your reply first.')],
  handleValidationErrors,
  run(req => store.replyToReview(uid(req), req.params.id as string, req.body.text), 'Reply saved')
);

router.get('/staff', run(req => store.listStaff(uid(req))));
router.post(
  '/staff',
  notificationMutationRateLimiter,
  [
    body('full_name').isString().isLength({ min: 1, max: 120 }).withMessage('Enter their full name.'),
    body('email').isString().isLength({ min: 1, max: 255 }).withMessage('Enter their email address. They sign in with it.'),
    body('phone').isString().isLength({ min: 1, max: 20 }).withMessage('Enter their phone number.'),
    body('id_type').isString().isLength({ min: 1, max: 30 }).withMessage("Choose the ID they'll show at the hub."),
  ],
  handleValidationErrors,
  run(req => store.addStaff(uid(req), req.body), 'Added')
);
router.post(
  '/staff/:id/invite',
  notificationMutationRateLimiter,
  [param('id').isUUID()],
  handleValidationErrors,
  run(req => store.resendStaffInvite(uid(req), req.params.id as string), 'Invite sent')
);
router.delete(
  '/staff/:id',
  notificationMutationRateLimiter,
  [param('id').isUUID()],
  handleValidationErrors,
  run(req => store.removeStaff(uid(req), req.params.id as string), 'Removed')
);

router.get('/insights', run(req => store.insights(uid(req))));

export default router;
