import { NextFunction, Request, Response } from 'express';
import logger from '../../utils/logger';
import {
  APP_VERSION_HEADER,
  AppUpdateRequiredError,
  MaintenanceError,
  checkAppVersion,
  getPublicConfig,
  isGateError,
} from '../../services/app/appConfig.service';

/**
 * Bid placement gates. The app turns these codes into full-screen states:
 * - 426 APP_UPDATE_REQUIRED → "Time to update" (only when the app sends X-App-Version; older
 *   apps and the web don't, and are never blocked here);
 * - 503 MAINTENANCE → "We're doing some maintenance".
 * Payments, payouts and deliveries never go through these.
 */

export const sendGateError = (res: Response, error: MaintenanceError | AppUpdateRequiredError) => {
  if (error instanceof MaintenanceError) {
    res.setHeader('Retry-After', '60');
    res.status(503).json({
      success: false,
      code: error.code,
      error: error.message,
      data: { maintenance: error.maintenance },
    });
    return;
  }
  const { min_version, latest_version, store_urls, whats_new } = error.release;
  res.status(426).json({
    success: false,
    code: error.code,
    error: error.message,
    data: { installed_version: error.installed, min_version, latest_version, store_urls, whats_new },
  });
};

/** Old app (below the minimum) → 426. Runs before auth so it costs nothing extra. */
export const requireSupportedAppVersion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await checkAppVersion(req.get(APP_VERSION_HEADER) || undefined);
    next();
  } catch (error) {
    if (isGateError(error)) return sendGateError(res, error);
    logger.error('App version check failed:', error);
    next(); // never block bidding because the check itself broke
  }
};

/** Maintenance on → 503 (cached state; placeBid re-checks in its transaction). */
export const refuseDuringMaintenance = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { maintenance } = await getPublicConfig();
    if (maintenance.active) return sendGateError(res, new MaintenanceError(maintenance));
    next();
  } catch (error) {
    logger.error('Maintenance check failed:', error);
    next();
  }
};

/** Both, for every route that places a bid, buys now or sets an auto-bid. */
export const biddingGate = [requireSupportedAppVersion, refuseDuringMaintenance];
