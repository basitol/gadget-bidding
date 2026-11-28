import { Request, Response } from 'express';
import { sendSuccess, sendError, sendPaginated } from '../../utils/response';
import * as gadgetService from '../../services/gadget/gadget.service';
import logger from '../../utils/logger';
import { safeErrorMessage } from '../../utils/errors';
import * as listingService from '../../services/gadget/listing.service';
import { sendListingError } from './listing.controller';

/** A listing-flow body names its device profile; the old body doesn't. */
const isListingFlow = (body: unknown) => !!body && typeof body === 'object' && (body as any).profile !== undefined;

const PUBLIC_GADGET_STATUSES = ['approved', 'listed', 'sold'] as const;

function canViewGadget(
  gadget: { seller_id?: string; status?: string },
  user?: { user_id: string; role: string }
): boolean {
  if (!gadget.status || PUBLIC_GADGET_STATUSES.includes(gadget.status as any)) {
    return true;
  }
  if (!user) return false;
  if (user.role === 'admin') return true;
  return gadget.seller_id === user.user_id;
}

/** The hidden lowest price (reserve) is for the seller and our team only. */
const forViewer = <T extends Record<string, any>>(gadget: T, user?: { user_id: string; role: string }): T => {
  if (user && (user.role === 'admin' || gadget.seller_id === user.user_id)) return gadget;
  const { auction_reserve_price: _reserve, ...rest } = gadget;
  return rest as unknown as T;
};

/**
 * Create a new gadget
 * POST /api/v1/gadgets
 */
export const createGadget = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    if (isListingFlow(req.body)) {
      try {
        const id = await listingService.createListing(req.user.user_id, req.body);
        const created = await gadgetService.getGadgetById(id);
        return sendSuccess(res, created, 'Sent for review. Our team checks listings within a day.', 201);
      } catch (error) {
        return sendListingError(res, error, 'Couldn’t send your listing. Try again.');
      }
    }

    const gadgetData = req.body;
    const gadget = await gadgetService.createGadget(req.user.user_id, gadgetData);

    sendSuccess(
      res,
      gadget,
      'Gadget created successfully and submitted for review',
      201
    );
  } catch (error: any) {
    logger.error('Create gadget error:', error);
    sendError(res, error.message || 'Failed to create gadget', 500);
  }
};

/**
 * Get gadget by ID
 * GET /api/v1/gadgets/:id
 */
export const getGadgetById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const gadget = await gadgetService.getGadgetById(id);

    if (!gadget) {
      return sendError(res, 'Gadget not found', 404);
    }

    if (!canViewGadget(gadget, req.user)) {
      return sendError(res, 'Gadget not found', 404);
    }

    sendSuccess(res, forViewer(gadget as any, req.user));
  } catch (error: unknown) {
    logger.error('Get gadget error:', error);
    sendError(res, safeErrorMessage(error, 'Failed to get gadget'), 500);
  }
};

/**
 * Get gadgets with filters
 * GET /api/v1/gadgets
 */
export const getGadgets = async (req: Request, res: Response) => {
  try {
    const filters = {
      category_id: req.query.category_id as string,
      status: req.query.status as any,
      statuses: req.query.status
        ? undefined
        : ([...PUBLIC_GADGET_STATUSES] as any),
      seller_id: req.query.seller_id as string,
      condition: req.query.condition as any,
      search: req.query.search as string,
      min_bids: req.query.min_bids ? parseInt(req.query.min_bids as string) : undefined,
      sort_by: req.query.sort_by as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
    };

    const { gadgets, total } = await gadgetService.getGadgets(filters);

    sendPaginated(res, gadgets.map(g => forViewer(g as any, req.user)), filters.page, filters.limit, total);
  } catch (error: any) {
    logger.error('Get gadgets error:', error);
    sendError(res, error.message || 'Failed to get gadgets', 500);
  }
};

/**
 * Update gadget
 * PUT /api/v1/gadgets/:id
 */
export const updateGadget = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { id } = req.params;
    const updates = req.body;

    if (isListingFlow(updates)) {
      try {
        await listingService.updateListing(id as string, req.user.user_id, updates);
        const updated = await gadgetService.getGadgetById(id as string);
        return sendSuccess(res, updated, 'Sent for review again. Our team checks listings within a day.');
      } catch (error) {
        return sendListingError(res, error, 'Couldn’t save your changes. Try again.');
      }
    }

    const gadget = await gadgetService.updateGadget(id, req.user.user_id, updates);

    sendSuccess(res, gadget, 'Gadget updated successfully');
  } catch (error: any) {
    logger.error('Update gadget error:', error);
    sendError(res, error.message || 'Failed to update gadget', 500);
  }
};

/**
 * Delete gadget
 * DELETE /api/v1/gadgets/:id
 */
export const deleteGadget = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { id } = req.params;

    await gadgetService.deleteGadget(id, req.user.user_id);

    sendSuccess(res, null, 'Gadget deleted successfully');
  } catch (error: any) {
    logger.error('Delete gadget error:', error);
    sendError(res, error.message || 'Failed to delete gadget', 500);
  }
};

/**
 * Approve gadget (admin only)
 * POST /api/v1/gadgets/:id/approve
 */
export const approveGadget = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    // TODO: Add admin role check middleware
    // For now, we'll just implement the function

    const { id } = req.params;

    const gadget = await gadgetService.approveGadget(id);

    sendSuccess(res, gadget, 'Gadget approved successfully');
  } catch (error: any) {
    logger.error('Approve gadget error:', error);
    sendError(res, error.message || 'Failed to approve gadget', 500);
  }
};

/**
 * Reject gadget (admin only)
 * POST /api/v1/gadgets/:id/reject
 */
export const rejectGadget = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    // TODO: Add admin role check middleware

    const { id } = req.params;
    const { rejection_reason } = req.body;

    const gadget = await gadgetService.rejectGadget(id, rejection_reason);

    sendSuccess(res, gadget, 'Gadget rejected');
  } catch (error: any) {
    logger.error('Reject gadget error:', error);
    sendError(res, error.message || 'Failed to reject gadget', 500);
  }
};

/**
 * Get seller's gadgets
 * GET /api/v1/gadgets/my-listings
 */
export const getMyGadgets = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const { gadgets, total } = await gadgetService.getGadgets({
      seller_id: req.user.user_id,
      page,
      limit,
    });

    sendPaginated(res, gadgets, page, limit, total);
  } catch (error: any) {
    logger.error('Get my gadgets error:', error);
    sendError(res, error.message || 'Failed to get your gadgets', 500);
  }
};

/**
 * Get gadget categories
 * GET /api/v1/gadgets/categories
 */
export const getCategories = async (req: Request, res: Response) => {
  try {
    const { query } = await import('../../config/database');
    const categories = await query('SELECT * FROM gadget_categories ORDER BY name');

    sendSuccess(res, categories);
  } catch (error: any) {
    logger.error('Get categories error:', error);
    sendError(res, error.message || 'Failed to get categories', 500);
  }
};

/**
 * Upload gadget images
 * POST /api/v1/gadgets/upload-images
 */
export const uploadImages = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return sendError(res, 'At least one image is required', 400);
    }

    const { buildUploadPath } = await import(
      '../middlewares/upload.middleware'
    );
    const {
      isCloudinaryEnabled,
      uploadLocalFiles,
    } = await import('../../services/media/cloudinary.service');

    let urls: string[];

    if (isCloudinaryEnabled()) {
      const localPaths = files.map(f => f.path);
      urls = await uploadLocalFiles(localPaths);
    } else {
      urls = files.map(file => buildUploadPath(file.filename));
    }

    sendSuccess(res, { urls }, 'Images uploaded successfully', 201);
  } catch (error: unknown) {
    logger.error('Upload images error:', error);
    sendError(res, safeErrorMessage(error, 'Failed to upload images'), 500);
  }
};
