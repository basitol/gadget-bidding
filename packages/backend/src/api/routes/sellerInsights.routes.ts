import { Router, Request, Response } from 'express';
import { query } from 'express-validator';
import { authenticate, sellerOnly } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { sendError, sendSuccess } from '../../utils/response';
import logger from '../../utils/logger';
import { INSIGHT_PERIODS, InsightPeriod, getSalesInsights } from '../../services/seller/insights.service';

/** Store › Sales insights. Mounted at /api/v1/seller/insights. */
const router: Router = Router();
router.use(authenticate, sellerOnly);

/** GET /?period=30d|6m|1y (default 6m) */
router.get(
  '/',
  [query('period').optional().isIn([...INSIGHT_PERIODS]).withMessage('Choose 30d, 6m or 1y.')],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const period = (req.query.period as InsightPeriod | undefined) ?? '6m';
      sendSuccess(res, await getSalesInsights(req.user!.user_id, period));
    } catch (error) {
      logger.error('Sales insights failed:', error);
      sendError(res, 'Couldn’t load your insights. Try again.', 500);
    }
  }
);

export default router;
