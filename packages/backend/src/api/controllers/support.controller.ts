import { Request, Response } from 'express';
import * as supportService from '../../services/support/support.service';
import { sendSuccess, sendError, sendPaginated } from '../../utils/response';
import logger from '../../utils/logger';

export const getMyThread = async (req: Request, res: Response) => {
  try {
    const thread = await supportService.getOrCreateOwnThread(
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
    await supportService.assertOwnsThread(id, req.user!.user_id);
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const result = await supportService.getThreadMessages(id, { page, limit });
    await supportService.markOwnerThreadRead(id, req.user!.user_id);
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
    const message = await supportService.sendOwnerMessage(
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

/** Help › Contact support: topic, optional order and a message, into the person's own thread. */
export const contact = async (req: Request, res: Response) => {
  try {
    const result = await supportService.contactSupport(req.user!.user_id, {
      topic: req.body?.topic,
      order_id: req.body?.order_id ?? null,
      body: req.body?.body,
    });
    sendSuccess(res, result, `Message sent. We'll reply within ${result.reply_within}.`);
  } catch (error: any) {
    logger.warn(`Contact support: ${error?.message}`);
    sendError(res, error.message || "We couldn't send that. Try again.", 400);
  }
};
