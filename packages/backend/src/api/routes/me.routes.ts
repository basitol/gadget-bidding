import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { notificationMutationRateLimiter } from '../middlewares/security.middleware';
import { sendSuccess, sendError } from '../../utils/response';
import logger from '../../utils/logger';
import * as meService from '../../services/buyer/me.service';
import * as watchlistService from '../../services/buyer/watchlist.service';
import * as autoBidService from '../../services/buyer/autobid.service';
import * as savedSearchService from '../../services/buyer/savedSearch.service';
import * as savedCardService from '../../services/buyer/savedCard.service';
import * as ratingService from '../../services/buyer/rating.service';
import * as authService from '../../services/auth/auth.service';
import * as missedPaymentService from '../../services/buyer/missedPayment.service';
import * as privacyService from '../../services/buyer/privacy.service';
import * as auctionResultService from '../../services/buyer/auctionResult.service';
import * as contactService from '../../services/buyer/contact.service';
import { otpRateLimiter } from '../middlewares/security.middleware';
import * as gadgetController from '../controllers/gadget.controller';
import { uploadGadgetImages } from '../middlewares/upload.middleware';
import { uploadRateLimiter } from '../middlewares/security.middleware';
import { biddingGate } from '../middlewares/appGate.middleware';

/**
 * /api/v1/me — the signed-in buyer's own things: profile, watchlist, auto-bids, alerts,
 * saved cards, ratings and bids.
 */
const router: Router = Router();
router.use(authenticate);

/** Wraps a handler: 400 with the error message on failure. */
const handle =
  (fn: (req: Request, userId: string) => Promise<unknown>, okMessage?: string) =>
  async (req: Request, res: Response) => {
    try {
      if (!req.user) return sendError(res, 'User not authenticated', 401);
      sendSuccess(res, await fn(req, req.user.user_id), okMessage);
    } catch (error: any) {
      logger.warn(`${req.method} ${req.originalUrl}: ${error?.message}`);
      sendError(res, error?.message || 'Something went wrong', 400);
    }
  };

const uuid = (name: string) => param(name).isUUID().withMessage('Invalid id');
const mutate = [notificationMutationRateLimiter];

/* ---- How an auction ended for me ---- */
router.get('/auction-result/:auctionId', [uuid('auctionId')], handleValidationErrors,
  handle((req, uid) => auctionResultService.getAuctionResult(uid, req.params.auctionId as string)));

/* ---- Change email or phone with a code (sent to the new one) ---- */
router.post('/contact/start', otpRateLimiter,
  [body('kind').isIn(['email', 'phone']), body('value').isString().isLength({ min: 3, max: 255 })],
  handleValidationErrors,
  handle((req, uid) => contactService.startContactChange(uid, req.body.kind, req.body.value), 'We sent you a code'));
router.post('/contact/resend', otpRateLimiter, [body('verification_id').isUUID()], handleValidationErrors,
  handle((req, uid) => contactService.resendContactCode(uid, req.body.verification_id), 'We sent a new code'));
router.post('/contact/verify', otpRateLimiter,
  [body('verification_id').isUUID(), body('code').isString().isLength({ min: 4, max: 8 })],
  handleValidationErrors,
  handle(async (req, uid) => {
    await contactService.finishContactChange(uid, req.body.verification_id, req.body.code);
    return { user: await authService.getPublicUser(uid), profile: await meService.getProfile(uid) };
  }, 'Saved'));

/* ---- Profile ---- */
router.get('/summary', handle((_req, uid) => meService.summary(uid)));
router.get('/profile', handle((_req, uid) => meService.getProfile(uid)));
/** Delete my account: refused while an order, dispute, live lead or wallet balance is open. */
router.delete('/account', ...mutate, handle((_req, uid) => authService.deleteAccount(uid), 'Your account is deleted'));
router.put(
  '/profile',
  ...mutate,
  [
    body('full_name').optional().isString(),
    body('username').optional().isString(),
    body('avatar_url').optional({ nullable: true }).isString(),
    body('phone_number').optional().isString().isLength({ max: 20 }),
  ],
  handleValidationErrors,
  handle(async (req, uid) => {
    await meService.updateProfile(uid, req.body);
    return { user: await authService.getPublicUser(uid), profile: await meService.getProfile(uid) };
  }, 'Profile updated')
);

/* ---- Privacy & your data ---- */
/** The three "What we use" switches, the account email and any open data request. */
router.get('/privacy', handle((_req, uid) => privacyService.getPrivacy(uid)));
router.put(
  '/privacy',
  ...mutate,
  [
    body('marketing_emails').optional().isBoolean(),
    body('personalised_picks').optional().isBoolean(),
    body('usage_stats').optional().isBoolean(),
  ],
  handleValidationErrors,
  handle((req, uid) => privacyService.updatePrivacy(uid, req.body), 'Saved')
);
/** "Request my data": one open request at a time; our team emails a link within 7 days. */
router.post('/data-request', ...mutate, handle((req, uid) => privacyService.requestData(uid, req)));
/** Help › "Was this helpful?" */
router.post(
  '/help-feedback',
  ...mutate,
  [body('article').isString().isLength({ min: 2, max: 80 }), body('helpful').isBoolean()],
  handleValidationErrors,
  handle((req, uid) => privacyService.recordHelpFeedback(uid, req.body.article, req.body.helpful), 'Thanks for telling us')
);

/* ---- Bids ---- */
router.get(
  '/bids',
  [query('tab').optional().isIn(['bidding', 'won', 'lost'])],
  handleValidationErrors,
  handle((req, uid) => meService.myBids(uid, (req.query.tab as meService.BidTab) || 'bidding'))
);

/* ---- Watchlist ---- */
router.get(
  '/watchlist',
  [query('filter').optional().isIn(['all', 'ending_soon', 'starting_soon'])],
  handleValidationErrors,
  handle((req, uid) => watchlistService.list(uid, (req.query.filter as watchlistService.WatchFilter) || 'all'))
);
router.get('/watchlist/ids', handle((_req, uid) => watchlistService.watchedIds(uid)));
router.put('/watchlist/:auctionId', ...mutate, [uuid('auctionId')], handleValidationErrors,
  handle(async (req, uid) => {
    await watchlistService.watch(uid, req.params.auctionId);
    return { watching: true };
  }, 'Added to your watchlist'));
router.delete('/watchlist/:auctionId', ...mutate, [uuid('auctionId')], handleValidationErrors,
  handle(async (req, uid) => {
    await watchlistService.unwatch(uid, req.params.auctionId);
    return { watching: false };
  }, 'Removed from your watchlist'));

/* ---- Auto-bid ---- */
router.get('/auto-bids/:auctionId', [uuid('auctionId')], handleValidationErrors,
  handle((req, uid) => autoBidService.getAutoBid(uid, req.params.auctionId)));
router.put('/auto-bids/:auctionId', ...mutate, ...biddingGate,
  [
    uuid('auctionId'),
    body('max_amount').isFloat({ gt: 0 }).withMessage('Enter your maximum bid'),
    body('notify_on_max').optional().isBoolean(),
  ],
  handleValidationErrors,
  handle((req, uid) =>
    autoBidService.setAutoBid(uid, req.params.auctionId, Number(req.body.max_amount), req.body.notify_on_max !== false),
    'Auto-bid is on'));
router.delete('/auto-bids/:auctionId', ...mutate, [uuid('auctionId')], handleValidationErrors,
  handle(async (req, uid) => {
    await autoBidService.cancelAutoBid(uid, req.params.auctionId);
    return { is_active: false };
  }, 'Auto-bid is off'));

/* ---- Saved searches / alerts ---- */
router.get('/saved-searches', handle((_req, uid) => savedSearchService.list(uid)));
router.post('/saved-searches', ...mutate,
  [
    body('query').optional().isString().isLength({ max: 120 }),
    body('category_slug').optional().isString().isLength({ max: 100 }),
    body('max_price').optional({ nullable: true }).isFloat({ gt: 0 }),
    body('condition').optional({ nullable: true }).isIn(['any', 'new', 'a_or_better', 'b_or_better']),
  ],
  handleValidationErrors,
  handle((req, uid) => savedSearchService.create(uid, req.body), "We'll tell you when it's listed"));
router.put('/saved-searches/:id', ...mutate, [uuid('id'), body('enabled').isBoolean()], handleValidationErrors,
  handle((req, uid) => savedSearchService.setEnabled(uid, req.params.id, req.body.enabled)));
router.delete('/saved-searches/:id', ...mutate, [uuid('id')], handleValidationErrors,
  handle(async (req, uid) => {
    await savedSearchService.remove(uid, req.params.id);
    return { removed: true };
  }, 'Alert removed'));

/* ---- Saved cards ---- */
router.get('/cards', handle((_req, uid) => savedCardService.list(uid)));
router.delete('/cards/:id', ...mutate, [uuid('id')], handleValidationErrors,
  handle(async (req, uid) => {
    await savedCardService.remove(uid, req.params.id);
    return savedCardService.list(uid);
  }, 'Card removed'));
router.put('/cards/:id/default', ...mutate, [uuid('id')], handleValidationErrors,
  handle(async (req, uid) => {
    await savedCardService.makeDefault(uid, req.params.id);
    return savedCardService.list(uid);
  }, 'Default card updated'));
router.post('/orders/:orderId/pay-with-card', ...mutate,
  [uuid('orderId'), body('card_id').isUUID().withMessage('Choose a card')],
  handleValidationErrors,
  handle((req, uid) => savedCardService.payOrder(uid, req.params.orderId, req.body.card_id), 'Payment successful'));

/* ---- Ratings ---- */
router.get('/ratings/:orderId', [uuid('orderId')], handleValidationErrors,
  handle((req, uid) => ratingService.getMyRatingForOrder(uid, req.params.orderId)));
router.post('/ratings', ...mutate,
  [
    body('order_id').isUUID(),
    body('score').isInt({ min: 1, max: 5 }).withMessage('Pick 1 to 5 stars'),
    body('comment').optional().isString().isLength({ max: 500 }),
  ],
  handleValidationErrors,
  handle((req, uid) => ratingService.rateOrder(uid, req.body.order_id, Number(req.body.score), req.body.comment),
    'Thanks for rating'));

/* ---- Missed payments (time to pay ran out) ---- */
router.get('/missed-payments', handle((_req, uid) => missedPaymentService.listMissedPayments(uid)));
router.get('/missed-payments/:id', [uuid('id')], handleValidationErrors,
  handle((req, uid) => missedPaymentService.getMissedPayment(uid, req.params.id)));

/* ---- Photos for a problem report (same storage as listing photos) ---- */
router.post('/uploads', uploadRateLimiter, (req: Request, res: Response, next) => {
  uploadGadgetImages(req, res, (err: unknown) => {
    if (!err) return next();
    const e = err as { code?: string; message?: string };
    if (e.code === 'LIMIT_FILE_SIZE') return sendError(res, 'Each photo must be 5MB or smaller', 400);
    if (e.code === 'LIMIT_FILE_COUNT') return sendError(res, 'Add up to 4 photos', 400);
    return sendError(res, e.message || "That photo didn't upload. Try again.", 400);
  });
}, gadgetController.uploadImages);

export default router;
