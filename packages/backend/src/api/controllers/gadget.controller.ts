import { Request, Response } from 'express';
import { sendSuccess, sendError, sendPaginated } from '../../utils/response';
import * as gadgetService from '../../services/gadget/gadget.service';
import logger from '../../utils/logger';

/**
 * Create a new gadget
 * POST /api/v1/gadgets
 */
export const createGadget = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
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

    sendSuccess(res, gadget);
  } catch (error: any) {
    logger.error('Get gadget error:', error);
    sendError(res, error.message || 'Failed to get gadget', 500);
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
      seller_id: req.query.seller_id as string,
      condition: req.query.condition as any,
      search: req.query.search as string,
      min_bids: req.query.min_bids ? parseInt(req.query.min_bids as string) : undefined,
      sort_by: req.query.sort_by as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
    };

    const { gadgets, total } = await gadgetService.getGadgets(filters);

    sendPaginated(res, gadgets, filters.page, filters.limit, total);
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
