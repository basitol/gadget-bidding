import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import * as authValidator from '../validators/auth.validator';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { authenticate } from '../middlewares/auth.middleware';
import {
  authRateLimiter,
  authSessionRateLimiter,
  otpRateLimiter,
} from '../middlewares/security.middleware';

import { getSignInPanel } from '../../services/admin/overview.service';

const router: Router = Router();

/**
 * @route   GET /api/v1/auth/sign-in-panel
 * @desc    Live activity and escrow figure for the admin sign-in page (public-safe, cached 1 min)
 * @access  Public
 */
router.get('/sign-in-panel', async (_req, res) => {
  try {
    res.json({ success: true, data: await getSignInPanel() });
  } catch {
    res.status(500).json({ success: false, error: "Couldn't load right now" });
  }
});

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  authRateLimiter,
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
  otpRateLimiter,
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
  authRateLimiter,
  authValidator.validateLogin,
  handleValidationErrors,
  authController.login
);

/**
 * @route   POST /api/v1/auth/social
 * @desc    Login with Google/Apple identity token
 * @access  Public
 */
router.post(
  '/social',
  authRateLimiter,
  authValidator.validateSocialLogin,
  handleValidationErrors,
  authController.socialLogin
);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Refresh access token
 * @access  Public
 */
router.post(
  '/refresh-token',
  authSessionRateLimiter,
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
  authSessionRateLimiter,
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
  otpRateLimiter,
  authValidator.validateResendOTP,
  handleValidationErrors,
  authController.resendOTP
);

/**
 * Email-first buyer sign-up:
 *   POST /signup/email → POST /signup/verify → POST /signup/complete
 * @access Public
 */
router.post(
  '/signup/email',
  otpRateLimiter,
  authValidator.validateSignupStart,
  handleValidationErrors,
  authController.signupStart
);
router.post(
  '/signup/verify',
  otpRateLimiter,
  authValidator.validateSignupVerify,
  handleValidationErrors,
  authController.signupVerify
);
router.post(
  '/signup/resend',
  otpRateLimiter,
  authValidator.validateSignupResend,
  handleValidationErrors,
  authController.signupResend
);
router.post(
  '/signup/complete',
  authRateLimiter,
  authValidator.validateSignupComplete,
  handleValidationErrors,
  authController.signupComplete
);
router.get('/username-available', authRateLimiter, authController.usernameAvailable);

/**
 * Password reset:
 *   POST /password/forgot → POST /password/verify → POST /password/reset
 * @access Public
 */
router.post(
  '/password/forgot',
  otpRateLimiter,
  authValidator.validatePasswordForgot,
  handleValidationErrors,
  authController.passwordForgot
);
router.post(
  '/password/verify',
  otpRateLimiter,
  authValidator.validatePasswordVerify,
  handleValidationErrors,
  authController.passwordVerify
);
router.post(
  '/password/resend',
  otpRateLimiter,
  authValidator.validatePasswordResend,
  handleValidationErrors,
  authController.passwordResend
);
router.post(
  '/password/reset',
  authRateLimiter,
  authValidator.validatePasswordReset,
  handleValidationErrors,
  authController.passwordReset
);

/** 2-step sign-in */
router.post(
  '/login/2fa',
  otpRateLimiter,
  authValidator.validateSignupVerify,
  handleValidationErrors,
  authController.loginTwoFactor
);
router.put('/2fa', authRateLimiter, authenticate, authController.setTwoFactor);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authenticate, authController.getCurrentUser);

export default router;
