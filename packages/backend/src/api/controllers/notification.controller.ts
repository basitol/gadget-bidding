import { Request, Response } from 'express';
import { sendSuccess, sendError, sendPaginated } from '../../utils/response';
import * as notificationService from '../../services/notification/notification.service';
import logger from '../../utils/logger';

/**
 * Get user's notifications
 * GET /api/v1/notifications
 */
export const getNotifications = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const unreadOnly = req.query.unread_only === 'true';

    const { notifications, total, unreadCount } =
      await notificationService.getUserNotifications(
        req.user.user_id,
        page,
        limit,
        unreadOnly
      );

    res.status(200).json({
      success: true,
      data: notifications,
      unread_count: unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    logger.error('Get notifications error:', error);
    sendError(res, error.message || 'Failed to get notifications', 500);
  }
};

/**
 * Get unread notification count
 * GET /api/v1/notifications/unread-count
 */
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { unreadCount } = await notificationService.getUserNotifications(
      req.user.user_id,
      1,
      1,
      true
    );

    sendSuccess(res, { unread_count: unreadCount });
  } catch (error: any) {
    logger.error('Get unread count error:', error);
    sendError(res, error.message || 'Failed to get unread count', 500);
  }
};

/**
 * Mark notification as read
 * PUT /api/v1/notifications/:notificationId/read
 */
export const markAsRead = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { notificationId } = req.params;

    const notification = await notificationService.markAsRead(
      notificationId,
      req.user.user_id
    );

    if (!notification) {
      return sendError(res, 'Notification not found', 404);
    }

    sendSuccess(res, notification, 'Notification marked as read');
  } catch (error: any) {
    logger.error('Mark as read error:', error);
    sendError(res, error.message || 'Failed to mark notification as read', 500);
  }
};

/**
 * Mark all notifications as read
 * PUT /api/v1/notifications/read-all
 */
export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const count = await notificationService.markAllAsRead(req.user.user_id);

    sendSuccess(
      res,
      { marked_count: count },
      `${count} notifications marked as read`
    );
  } catch (error: any) {
    logger.error('Mark all as read error:', error);
    sendError(
      res,
      error.message || 'Failed to mark notifications as read',
      500
    );
  }
};

/**
 * Delete notification
 * DELETE /api/v1/notifications/:notificationId
 */
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { notificationId } = req.params;

    const deleted = await notificationService.deleteNotification(
      notificationId,
      req.user.user_id
    );

    if (!deleted) {
      return sendError(res, 'Notification not found', 404);
    }

    sendSuccess(res, null, 'Notification deleted');
  } catch (error: any) {
    logger.error('Delete notification error:', error);
    sendError(res, error.message || 'Failed to delete notification', 500);
  }
};
