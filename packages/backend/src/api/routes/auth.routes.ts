import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import * as authValidator from '../validators/auth.validator';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { authenticate } from '../middlewares/auth.middleware';

const router: Router = Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  authValidator.validateRegistration,
  handleValidationErrors,
  authController.register
);

/**
 * @route   POST /api/v1/auth/verify-otp
 * @desc    Verify OTP code
 * @access  Public
 */
router.post(
  '/verify-otp',
  authValidator.validateOTPVerification,
  handleValidationErrors,
  authController.verifyOTP
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  '/login',
  authValidator.validateLogin,
  handleValidationErrors,
  authController.login
);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Refresh access token
 * @access  Public
 */
router.post(
  '/refresh-token',
  authValidator.validateRefreshToken,
  handleValidationErrors,
  authController.refreshToken
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user
 * @access  Public
 */
router.post(
  '/logout',
  authValidator.validateRefreshToken,
  handleValidationErrors,
  authController.logout
);

/**
 * @route   POST /api/v1/auth/resend-otp
 * @desc    Resend OTP code
 * @access  Public
 */
router.post(
  '/resend-otp',
  authValidator.validateResendOTP,
  handleValidationErrors,
  authController.resendOTP
);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authenticate, authController.getCurrentUser);

export default router;
