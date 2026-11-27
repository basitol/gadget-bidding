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

/* ---- Profile ---- */
router.get('/summary', handle((_req, uid) => meService.summary(uid)));
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
    return authService.getPublicUser(uid);
  }, 'Profile updated')
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
router.put('/auto-bids/:auctionId', ...mutate,
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
  ],
  handleValidationErrors,
  handle((req, uid) => savedSearchService.create(uid, req.body), "We'll tell you when it's listed"));
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

export default router;
