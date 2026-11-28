import { Router, Request, Response } from 'express';
import { param, query } from 'express-validator';
import { authenticate, adminOnly } from '../middlewares/auth.middleware';
import { adminMutationRateLimiter } from '../middlewares/security.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { recordAuditEventSafe } from '../../services/audit/audit.service';
import * as deviceModels from '../../services/gadget/deviceModels.service';
import logger from '../../utils/logger';

/**
 * Device models the "List a gadget" search offers. Our team adds new ones here.
 * Mounted at /api/v1/admin/device-models.
 */
const router: Router = Router();
router.use(authenticate, adminOnly, adminMutationRateLimiter);

const fail = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof deviceModels.DeviceModelError) {
    return res.status(error.status).json({ success: false, error: error.message });
  }
  logger.error(`${fallback}:`, error);
  return res.status(500).json({ success: false, error: fallback });
};

router.get(
  '/',
  [
    query('status').optional().isIn(['active', 'inactive', 'all']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 50);
      const { items, total } = await deviceModels.adminListModels({
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        category: typeof req.query.category === 'string' ? req.query.category : undefined,
        status: (req.query.status as any) ?? 'all',
        page,
        limit,
      });
      res.json({ success: true, data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (error) {
      fail(res, error, 'Couldn’t load the device models');
    }
  }
);

router.post('/', async (req: Request, res: Response) => {
  try {
    const model = await deviceModels.adminCreateModel(req.user!.user_id, req.body ?? {});
    recordAuditEventSafe({
      req,
      action: 'device_model_added',
      resourceType: 'device_model',
      resourceId: model.id,
      changes: { name: model.name, brand: model.brand, profile: model.profile, category: model.category },
    });
    res.status(201).json({ success: true, data: model, message: `${model.name} added. Sellers can pick it now.` });
  } catch (error) {
    fail(res, error, 'Couldn’t add that model');
  }
});

router.patch('/:id', [param('id').isUUID()], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const { before, after } = await deviceModels.adminUpdateModel(req.params.id as string, req.body ?? {});
    recordAuditEventSafe({
      req,
      action: before.is_active !== after.is_active ? (after.is_active ? 'device_model_reactivated' : 'device_model_deactivated') : 'device_model_updated',
      resourceType: 'device_model',
      resourceId: after.id,
      changes: { before: { name: before.name, brand: before.brand, profile: before.profile, is_active: before.is_active }, after: { name: after.name, brand: after.brand, profile: after.profile, is_active: after.is_active } },
    });
    res.json({
      success: true,
      data: after,
      message:
        before.is_active !== after.is_active
          ? after.is_active
            ? `${after.name} is back in the search.`
            : `${after.name} is hidden from the search. Listings that use it stay as they are.`
          : `${after.name} saved`,
    });
  } catch (error) {
    fail(res, error, 'Couldn’t save that model');
  }
});

export default router;
