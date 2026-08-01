import { Request, Response } from 'express';
import * as supportService from '../../services/support/support.service';
import { sendSuccess, sendError, sendPaginated } from '../../utils/response';
import logger from '../../utils/logger';

export const getMyThread = async (req: Request, res: Response) => {
  try {
    const thread = await supportService.getOrCreateSellerThread(
      req.user!.user_id
    );
    sendSuccess(res, thread);
  } catch (error: any) {
    logger.error('Get support thread error:', error);
    sendError(res, error.message || 'Failed to open support chat', 400);
  }
};

export const getMessages = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await supportService.assertSellerOwnsThread(id, req.user!.user_id);
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const result = await supportService.getThreadMessages(id, { page, limit });
    await supportService.markSellerThreadRead(id, req.user!.user_id);
    sendPaginated(
      res,
      result.data,
      result.pagination.page,
      result.pagination.limit,
      result.pagination.total
    );
  } catch (error: any) {
    logger.error('Get support messages error:', error);
    sendError(res, error.message || 'Failed to load messages', 400);
  }
};

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { body } = req.body as { body?: string };
    if (!body || !String(body).trim()) {
      return sendError(res, 'Message body is required', 400);
    }
    const message = await supportService.sendSellerMessage(
      id,
      req.user!.user_id,
      body
    );
    sendSuccess(res, message, 'Message sent');
  } catch (error: any) {
    logger.error('Send support message error:', error);
    sendError(res, error.message || 'Failed to send message', 400);
  }
};
