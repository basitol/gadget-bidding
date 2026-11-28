import { Router, Request, Response } from 'express';
import { authenticate, sellerOnly } from '../middlewares/auth.middleware';
import { sendSuccess } from '../../utils/response';
import logger from '../../utils/logger';
import * as hub from '../../services/seller/hub.service';

/**
 * Getting a sold item to the hub and back (/seller/hub): send to hub, rider booking, drop-off code,
 * inspection result, failed-check choice, collection. The views are read from
 * GET /seller/hub/orders/:id; each action returns the updated view.
 */
const router: Router = Router();
router.use(authenticate, sellerOnly);

const run = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    sendSuccess(res, await fn(req));
  } catch (error: any) {
    if (error instanceof hub.HubError) {
      res
        .status(error.status)
        .json({ success: false, error: error.message, ...(error.code ? { code: error.code } : {}) });
      return;
    }
    logger.error('Seller hub error:', error);
    res.status(500).json({ success: false, error: "That didn't work. Try again." });
  }
};

const seller = (req: Request) => req.user!.user_id;
const id = (req: Request) => String(req.params.id);

router.get(
  '/orders/:id',
  run(req => hub.getHubView(seller(req), id(req)))
);
router.get(
  '/orders/:id/rider-options',
  run(req => hub.riderOptions(seller(req), id(req)))
);
router.post(
  '/orders/:id/dropoff',
  run(req => hub.chooseDropoff(seller(req), id(req), req.body ?? {}))
);
router.post(
  '/orders/:id/rider',
  run(req => hub.bookRider(seller(req), id(req), req.body ?? {}))
);
router.post(
  '/orders/:id/failed-choice',
  run(req => hub.chooseAfterFailedCheck(seller(req), id(req), req.body ?? {}))
);

export default router;
