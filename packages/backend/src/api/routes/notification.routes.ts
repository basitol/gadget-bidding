import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { body, param, query } from 'express-validator';
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
 * @route   POST /api/v1/notifications/push-token
 * @desc    Save this device's Expo push token
 * @access  Private
 */
router.post(
  '/push-token',
  notificationMutationRateLimiter,
  authenticate,
  [
    body('token').isString().isLength({ min: 10, max: 255 }),
    body('platform').isIn(['ios', 'android']),
  ],
  handleValidationErrors,
  notificationController.registerPushToken
);

/**
 * @route   DELETE /api/v1/notifications/push-token
 * @desc    Forget this device's push token
 * @access  Private
 */
router.delete(
  '/push-token',
  notificationMutationRateLimiter,
  authenticate,
  [body('token').isString().isLength({ min: 10, max: 255 })],
  handleValidationErrors,
  notificationController.removePushToken
);

/**
 * @route   GET|PUT /api/v1/notifications/preferences
 * @desc    Alert switches from Profile › Notifications: one per row, delivery channels
 *          { push, email, sms } and quiet_hours. Old apps' bids / orders / marketing still work.
 * @access  Private
 */
router.get('/preferences', authenticate, notificationController.getPreferences);
router.put(
  '/preferences',
  notificationMutationRateLimiter,
  authenticate,
  [
    ...[
      'bids',
      'orders',
      'marketing',
      'outbid',
      'ending_soon',
      'autobid_max',
      'won',
      'payment_reminders',
      'delivery_updates',
      'dispute_updates',
      'saved_search',
      'quiet_hours',
      // Seller app
      'sales',
      'seller_bids',
      'payouts',
    ].map(k => body(k).optional().isBoolean()),
    body('channels').optional().isObject(),
    body('channels.push').optional().isBoolean(),
    body('channels.email').optional().isBoolean(),
    body('channels.sms').optional().isBoolean(),
  ],
  handleValidationErrors,
  notificationController.updatePreferences
);

/**
 * @route   POST /api/v1/notifications/push-test
 * @desc    Send yourself a test push (development only)
 * @access  Private
 */
router.post('/push-test', notificationMutationRateLimiter, authenticate, notificationController.sendTestPush);

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
