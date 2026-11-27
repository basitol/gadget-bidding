import { Request, Response, Router } from 'express';
import * as appConfig from '../../services/app/appConfig.service';
import * as auditService from '../../services/audit/audit.service';
import { broadcastAuctionExtended } from '../../services/socket/socket.service';
import { sendError, sendSuccess } from '../../utils/response';
import logger from '../../utils/logger';

/**
 * GET /api/v1/app-config — public, cached. What the app needs before anything else:
 * minimum / latest version, store links, "What's new", and whether maintenance is on.
 * Sends `update_required` too when the app passes X-App-Version.
 */
export const publicRouter: Router = Router();

publicRouter.get('/', async (req: Request, res: Response) => {
  try {
    const cfg = await appConfig.getPublicConfig();
    const installed = req.get(appConfig.APP_VERSION_HEADER);
    const known = installed && appConfig.isValidVersion(installed);
    res.setHeader('Cache-Control', 'public, max-age=15');
    res.vary('X-App-Version'); // keeps CORS's Vary: Origin
    sendSuccess(res, {
      ...cfg,
      ...(known && { update_required: appConfig.compareVersions(installed, cfg.min_version) < 0 }),
    });
  } catch (error: any) {
    logger.error('App config failed:', error);
    sendError(res, 'Could not load app settings', 500);
  }
});

/**
 * /api/v1/admin/app-config — mounted inside admin.routes (authenticate + adminOnly).
 */
export const adminRouter: Router = Router();

const adminState = async () => {
  const [release, maintenance, history] = await Promise.all([
    appConfig.getReleaseSettings(),
    appConfig.getMaintenance(),
    appConfig.recentWindows(5),
  ]);
  const affected = maintenance.active && maintenance.started_at
    ? await appConfig.countAffectedAuctions(new Date(maintenance.started_at))
    : 0;
  return { release, maintenance: { ...maintenance, affected_auctions: affected }, history };
};

adminRouter.get('/', async (_req: Request, res: Response) => {
  try {
    sendSuccess(res, await adminState());
  } catch (error: any) {
    sendError(res, error.message || 'Could not load app settings', 500);
  }
});

adminRouter.put('/release', async (req: Request, res: Response) => {
  try {
    const before = await appConfig.getReleaseSettings();
    const release = await appConfig.updateReleaseSettings(req.user!.user_id, req.body || {});
    auditService.recordAuditEventSafe({
      req,
      action: 'app_release_update',
      resourceType: 'app_settings',
      changes: {
        before: { min_version: before.min_version, latest_version: before.latest_version, store_urls: before.store_urls, whats_new: before.whats_new },
        after: { min_version: release.min_version, latest_version: release.latest_version, store_urls: release.store_urls, whats_new: release.whats_new },
      },
    });
    sendSuccess(res, await adminState(), 'App versions saved');
  } catch (error: any) {
    sendError(res, error.message || 'Could not save app versions', 400);
  }
});

adminRouter.post('/maintenance/start', async (req: Request, res: Response) => {
  try {
    const { back_by, message, reason } = req.body || {};
    const w = await appConfig.startMaintenance(req.user!.user_id, { back_by, message, reason });
    auditService.recordAuditEventSafe({
      req,
      action: 'maintenance_start',
      resourceType: 'maintenance',
      resourceId: w.id,
      changes: {
        started_at: w.startedAt.toISOString(),
        back_by: w.backBy?.toISOString() ?? null,
        message: w.message,
        reason: w.reason,
      },
    });
    sendSuccess(res, await adminState(), 'Maintenance is on. Bidding is paused.');
  } catch (error: any) {
    sendError(res, error.message || 'Could not start maintenance', 400);
  }
});

adminRouter.patch('/maintenance', async (req: Request, res: Response) => {
  try {
    const { back_by, message } = req.body || {};
    const w = await appConfig.updateMaintenance({ back_by, message });
    auditService.recordAuditEventSafe({
      req,
      action: 'maintenance_update',
      resourceType: 'maintenance',
      resourceId: w.id,
      changes: { back_by: w.backBy?.toISOString() ?? null, message: w.message },
    });
    sendSuccess(res, await adminState(), 'Maintenance updated');
  } catch (error: any) {
    sendError(res, error.message || 'Could not update maintenance', 400);
  }
});

adminRouter.post('/maintenance/end', async (req: Request, res: Response) => {
  try {
    const ended = await appConfig.endMaintenance(req.user!.user_id);
    auditService.recordAuditEventSafe({
      req,
      action: 'maintenance_end',
      resourceType: 'maintenance',
      resourceId: ended.id,
      changes: {
        started_at: ended.started_at,
        ended_at: ended.ended_at,
        paused_seconds: ended.paused_seconds,
        auctions_extended: ended.auctions_extended,
      },
    });
    // Open auction screens move their countdowns straight away.
    const minutes = Math.round(ended.paused_seconds / 60);
    for (const a of ended.extended) {
      try {
        broadcastAuctionExtended(a.id, new Date(a.end_time), minutes);
      } catch (err) {
        logger.warn(`Could not broadcast extension for ${a.id}:`, err);
      }
    }
    const { extended: _ids, ...summary } = ended;
    sendSuccess(res, { ...(await adminState()), ended: summary }, 'Maintenance ended. Bidding is open again.');
  } catch (error: any) {
    sendError(res, error.message || 'Could not end maintenance', 400);
  }
});
