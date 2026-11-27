import { Request, Response } from 'express';
import { sendSuccess, sendError, sendPaginated } from '../../utils/response';
import * as notificationService from '../../services/notification/notification.service';
import * as pushService from '../../services/notification/push.service';
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

/**
 * Save this device's Expo push token for the signed-in user
 * POST /api/v1/notifications/push-token
 */
export const registerPushToken = async (req: Request, res: Response) => {
  try {
    if (!req.user) return sendError(res, 'User not authenticated', 401);
    await pushService.registerToken(req.user.user_id, req.body.token, req.body.platform);
    sendSuccess(res, { registered: true }, 'Push notifications on');
  } catch (error: any) {
    logger.error('Register push token error:', error);
    sendError(res, error.message || 'Could not turn on push notifications', 400);
  }
};

/**
 * Forget this device's push token (on logout or when notifications are turned off)
 * DELETE /api/v1/notifications/push-token
 */
export const removePushToken = async (req: Request, res: Response) => {
  try {
    if (!req.user) return sendError(res, 'User not authenticated', 401);
    await pushService.removeToken(req.user.user_id, req.body.token);
    sendSuccess(res, { removed: true }, 'Push notifications off');
  } catch (error: any) {
    logger.error('Remove push token error:', error);
    sendError(res, error.message || 'Could not turn off push notifications', 400);
  }
};

/**
 * Send yourself a test push (not available in production)
 * POST /api/v1/notifications/push-test
 */
export const sendTestPush = async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') return sendError(res, 'Not found', 404);
  if (!req.user) return sendError(res, 'User not authenticated', 401);
  const sent = await pushService.sendToUser(req.user.user_id, {
    title: 'Test notification',
    body: 'Push notifications are working on this device.',
    data: { type: 'system' },
  });
  sendSuccess(res, { sent }, sent ? 'Sent' : 'No devices registered for this account');
};

/**
 * GET /api/v1/notifications/preferences
 */
export const getPreferences = async (req: Request, res: Response) => {
  try {
    if (!req.user) return sendError(res, 'User not authenticated', 401);
    sendSuccess(res, await notificationService.getPreferences(req.user.user_id));
  } catch (error: any) {
    sendError(res, error.message || 'Could not load alert settings', 400);
  }
};

/**
 * PUT /api/v1/notifications/preferences  { outbid?, …, channels?: { push, email, sms }, quiet_hours? }
 */
export const updatePreferences = async (req: Request, res: Response) => {
  try {
    if (!req.user) return sendError(res, 'User not authenticated', 401);
    sendSuccess(
      res,
      await notificationService.updatePreferences(req.user.user_id, req.body),
      'Alert settings saved'
    );
  } catch (error: any) {
    sendError(res, error.message || 'Could not save alert settings', 400);
  }
};
