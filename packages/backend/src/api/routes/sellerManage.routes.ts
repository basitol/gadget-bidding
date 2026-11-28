import { Router, Request, Response } from 'express';
import { authenticate, sellerOnly, requireSellerKyb } from '../middlewares/auth.middleware';
import { sendError, sendSuccess } from '../../utils/response';
import logger from '../../utils/logger';
import * as manage from '../../services/seller/listingManage.service';

/**
 * Managing a listing after it went live, mounted at /api/v1/seller/manage:
 *   GET    /:auctionId                manage view (stats, what can change, tips from real sales)
 *   PATCH  /:auctionId                no bids: { starting_price?, duration_hours?, note? }
 *   POST   /:auctionId/end            no bids: { reason: sold_elsewhere|change_price|found_fault|other }
 *   POST   /:auctionId/end-early      bids: { action: sell|cancel, detail? }
 *   POST   /:auctionId/bidder-note    { note } (our team checks it first)
 *   POST   /:auctionId/photos         { urls } (uploaded with /gadgets/upload-images; checked first)
 *   DELETE /:auctionId/photos         { url } a photo that's still waiting
 *   GET    /:auctionId/relist         what relisting looks like (similar sales, our tip)
 *   POST   /:auctionId/relist         { starting_price, duration_hours } (goes through the listing gate)
 */
const router: Router = Router();
router.use(authenticate, sellerOnly);

const run = (fn: (req: Request) => Promise<unknown>, message?: string) => async (req: Request, res: Response) => {
  try {
    sendSuccess(res, await fn(req), message);
  } catch (error: any) {
    if (error instanceof manage.ManageError) {
      res
        .status(error.status)
        .json({ success: false, error: error.message, ...(error.code ? { code: error.code } : {}) });
      return;
    }
    logger.error('Seller manage listing error:', error);
    sendError(res, 'That didn’t work. Try again.', 500);
  }
};

const me = (req: Request) => req.user!.user_id;
const id = (req: Request) => String(req.params.auctionId);

router.get(
  '/:auctionId',
  run(req => manage.getManageView(me(req), id(req)))
);
router.patch(
  '/:auctionId',
  run(req => manage.editListing(me(req), id(req), req.body ?? {}), 'Saved')
);
router.post(
  '/:auctionId/end',
  run(req => manage.endListing(me(req), id(req), req.body?.reason), 'Listing ended')
);
router.post(
  '/:auctionId/end-early',
  run(req => manage.endEarly(me(req), id(req), req.body ?? {}))
);
router.post(
  '/:auctionId/bidder-note',
  run(req => manage.addBidderNote(me(req), id(req), req.body?.note), 'Sent to our team')
);
router.post(
  '/:auctionId/photos',
  run(req => manage.addPhotos(me(req), id(req), req.body?.urls), 'Sent to our team')
);
router.delete(
  '/:auctionId/photos',
  run(req => manage.removePendingPhoto(me(req), id(req), req.body?.url ?? req.query.url))
);
router.get(
  '/:auctionId/relist',
  run(req => manage.getRelistView(me(req), id(req)))
);
// Relisting is a new listing: the same gate as "List a gadget" (403 with its code, e.g. LISTINGS_PAUSED).
router.post(
  '/:auctionId/relist',
  requireSellerKyb,
  run(req => manage.relist(me(req), id(req), req.body ?? {}), "It's back up for auction")
);

export default router;
