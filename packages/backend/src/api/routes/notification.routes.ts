import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { param, query } from 'express-validator';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { notificationMutationRateLimiter } from '../middlewares/security.middleware';

const router: Router = Router();

/**
 * @route   GET /api/v1/notifications
 * @desc    Get user's notifications
 * @access  Private
 */
router.get(
  '/',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('unread_only').optional().isBoolean(),
  ],
  handleValidationErrors,
  notificationController.getNotifications
);

/**
 * @route   GET /api/v1/notifications/unread-count
 * @desc    Get unread notification count
 * @access  Private
 */
router.get(
  '/unread-count',
  authenticate,
  notificationController.getUnreadCount
);

/**
 * @route   PUT /api/v1/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put(
  '/read-all',
  notificationMutationRateLimiter,
  authenticate,
  notificationController.markAllAsRead
);

/**
 * @route   PUT /api/v1/notifications/:notificationId/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put(
  '/:notificationId/read',
  notificationMutationRateLimiter,
  authenticate,
  [param('notificationId').isUUID().withMessage('Invalid notification ID')],
  handleValidationErrors,
  notificationController.markAsRead
);

/**
 * @route   DELETE /api/v1/notifications/:notificationId
 * @desc    Delete notification
 * @access  Private
 */
router.delete(
  '/:notificationId',
  notificationMutationRateLimiter,
  authenticate,
  [param('notificationId').isUUID().withMessage('Invalid notification ID')],
  handleValidationErrors,
  notificationController.deleteNotification
);

export default router;
