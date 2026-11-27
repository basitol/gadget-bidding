import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import * as authService from '../../services/auth/auth.service';
import * as twoFactorService from '../../services/auth/twoFactor.service';
import * as riskService from '../../services/risk/risk.service';
import * as auditService from '../../services/audit/audit.service';
import logger from '../../utils/logger';

/**
 * Register new user
 * POST /api/v1/auth/register
 */
export const register = async (req: Request, res: Response) => {
  try {
    const { phone_number, email, full_name, password, account_type, accepted_terms } =
      req.body;

    const result = await authService.registerUser({
      phone_number,
      email,
      full_name,
      password,
      account_type,
      accepted_terms,
    });

    sendSuccess(
      res,
      {
        verification_id: result.verification_id,
        message: 'OTP sent to your phone number',
      },
      'Registration successful. Please verify your phone number',
      201
    );
  } catch (error: any) {
    logger.error('Registration error:', error);
    sendError(res, error.message || 'Registration failed', 400);
  }
};

/**
 * Verify OTP
 * POST /api/v1/auth/verify-otp
 */
export const verifyOTP = async (req: Request, res: Response) => {
  try {
    const { verification_id, otp } = req.body;

    const tokens = await authService.verifyOTP({
      verification_id,
      otp,
    });

    sendSuccess(res, tokens, 'Phone number verified successfully');
  } catch (error: any) {
    logger.error('OTP verification error:', error);
    auditService
      .recordFailedOtp(
        req,
        req.body?.verification_id,
        error.message || 'OTP verification failed'
      )
      .catch(err => {
        logger.error('Failed to record OTP audit:', err);
      });
    riskService.recordFailedOtp(req.body?.verification_id).catch(err => {
      logger.error('Failed to record OTP risk:', err);
    });
    sendError(res, error.message || 'OTP verification failed', 400);
  }
};

/** Every admin sign-in goes in the audit log (the sign-in page promises it). */
const recordAdminSignIn = (req: Request, result: any) => {
  const user = result?.user;
  if (user?.role !== 'admin') return;
  auditService.recordAuditEventSafe({
    req,
    userId: user.id,
    action: 'admin_sign_in',
    resourceType: 'auth',
    resourceId: user.id,
  });
};

/**
 * Login user
 * POST /api/v1/auth/login
 */
export const login = async (req: Request, res: Response) => {
  try {
    const { identifier, password, account_type, device_id, device_label } = req.body;

    const tokens = await authService.loginUser({
      identifier,
      password,
      account_type,
      device_id,
      device_label,
    });
    recordAdminSignIn(req, tokens);

    sendSuccess(res, tokens, 'Login successful');
  } catch (error: any) {
    logger.error('Login error:', error);
    auditService
      .recordFailedLogin(
        req,
        req.body?.identifier,
        error.message || 'Login failed'
      )
      .catch(err => {
        logger.error('Failed to record login audit:', err);
      });
    sendError(res, error.message || 'Login failed', 401);
  }
};

/**
 * Login with Google or Apple
 * POST /api/v1/auth/social
 */
export const socialLogin = async (req: Request, res: Response) => {
  try {
    const { provider, id_token, account_type, accepted_terms } = req.body;

    const tokens = await authService.socialLogin({
      provider,
      id_token,
      account_type,
      accepted_terms,
    });

    sendSuccess(res, tokens, 'Login successful');
  } catch (error: any) {
    logger.error('Social login error:', error);
    sendError(res, error.message || 'Social login failed', 401);
  }
};

/**
 * Refresh access token
 * POST /api/v1/auth/refresh-token
 */
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;

    const result = await authService.refreshAccessToken(refresh_token);

    sendSuccess(res, result, 'Token refreshed successfully');
  } catch (error: any) {
    logger.error('Token refresh error:', error);
    sendError(res, error.message || 'Token refresh failed', 401);
  }
};

/**
 * Logout user
 * POST /api/v1/auth/logout
 */
export const logout = async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;

    await authService.logoutUser(refresh_token);

    sendSuccess(res, null, 'Logout successful');
  } catch (error: any) {
    logger.error('Logout error:', error);
    sendError(res, error.message || 'Logout failed', 400);
  }
};

/**
 * Resend OTP
 * POST /api/v1/auth/resend-otp
 */
export const resendOTP = async (req: Request, res: Response) => {
  try {
    const identifier = req.body.identifier || req.body.phone_number;

    const result = await authService.resendOTP(identifier);

    sendSuccess(res, result, 'A new verification code has been sent');
  } catch (error: any) {
    logger.error('Resend OTP error:', error);
    sendError(res, error.message || 'Failed to resend OTP', 400);
  }
};

/**
 * Get current user profile
 * GET /api/v1/auth/me
 */
export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    // In a real app, you'd fetch the full user from database
    // For now, return the user from token
    sendSuccess(res, req.user, 'User profile retrieved successfully');
  } catch (error: any) {
    logger.error('Get current user error:', error);
    sendError(res, error.message || 'Failed to get user profile', 400);
  }
};

/* ---------- Email-first buyer sign-up ---------- */

/** POST /api/v1/auth/signup/email — email a 6-digit code to start sign-up */
export const signupStart = async (req: Request, res: Response) => {
  try {
    const result = await authService.startEmailSignup(req.body.email);
    sendSuccess(res, result, 'We sent you a 6-digit code', 201);
  } catch (error: any) {
    sendError(res, error.message || 'Could not start sign-up', 400);
  }
};

/** POST /api/v1/auth/signup/verify — confirm the emailed code */
export const signupVerify = async (req: Request, res: Response) => {
  try {
    const result = await authService.verifyEmailSignup(req.body);
    sendSuccess(res, result, 'Email confirmed');
  } catch (error: any) {
    sendError(res, error.message || 'Could not confirm the code', 400);
  }
};

/** POST /api/v1/auth/signup/resend — send a fresh code */
export const signupResend = async (req: Request, res: Response) => {
  try {
    const result = await authService.resendEmailSignup(req.body.verification_id);
    sendSuccess(res, result, 'A new code is on its way');
  } catch (error: any) {
    sendError(res, error.message || 'Could not resend the code', 400);
  }
};

/** GET /api/v1/auth/username-available?username= */
export const usernameAvailable = async (req: Request, res: Response) => {
  try {
    const available = await authService.isUsernameAvailable(String(req.query.username || ''));
    sendSuccess(res, { available });
  } catch (error: any) {
    sendError(res, error.message || 'Could not check that username', 400);
  }
};

/** POST /api/v1/auth/signup/complete — create the account and sign in */
export const signupComplete = async (req: Request, res: Response) => {
  try {
    const tokens = await authService.completeEmailSignup(req.body);
    sendSuccess(res, tokens, 'Account created', 201);
  } catch (error: any) {
    logger.error('Email sign-up error:', error);
    sendError(res, error.message || 'Could not create your account', 400);
  }
};

/** POST /api/v1/auth/login/2fa — finish a 2-step sign-in with the emailed, texted or app code */
export const loginTwoFactor = async (req: Request, res: Response) => {
  try {
    const { verification_id, otp, account_type, device_id, device_label } = req.body;
    const tokens = await authService.completeTwoFactorLogin({
      verification_id,
      otp,
      account_type,
      device_id,
      device_label,
    });
    recordAdminSignIn(req, tokens);
    sendSuccess(res, tokens, 'Login successful');
  } catch (error: any) {
    sendError(res, error.message || 'Login failed', 401);
  }
};

/** PUT /api/v1/auth/2fa { enabled, password } — turn 2-step sign-in on or off */
export const setTwoFactor = async (req: Request, res: Response) => {
  try {
    if (!req.user) return sendError(res, 'User not authenticated', 401);
    const result = await authService.setTwoFactor(req.user.user_id, req.body.enabled === true, req.body.password);
    sendSuccess(res, result, result.two_factor_enabled ? '2-step sign-in is on' : '2-step sign-in is off');
  } catch (error: any) {
    sendError(res, error.message || 'Could not change 2-step sign-in', 400);
  }
};

/** GET /api/v1/auth/2fa — { enabled, method, email_hint, sms_phone_hint } */
export const getTwoFactor = async (req: Request, res: Response) => {
  try {
    if (!req.user) return sendError(res, 'User not authenticated', 401);
    sendSuccess(res, await twoFactorService.getTwoFactorStatus(req.user.user_id));
  } catch (error: any) {
    sendError(res, error.message || "Couldn't load 2-step sign-in", 400);
  }
};

/** POST /api/v1/auth/2fa/setup { method: 'totp' | 'sms' } */
export const setupTwoFactor = async (req: Request, res: Response) => {
  try {
    if (!req.user) return sendError(res, 'User not authenticated', 401);
    const method = req.body.method as twoFactorService.SetupMethod;
    const result = await twoFactorService.startTwoFactorSetup(req.user.user_id, method);
    sendSuccess(res, result, method === 'totp' ? 'Add this key to your authenticator app' : 'We texted you a code');
  } catch (error: any) {
    sendError(res, error.message || "Couldn't start 2-step sign-in", 400);
  }
};

/** POST /api/v1/auth/2fa/confirm { method, code, verification_id? } — turns 2-step on, returns the user */
export const confirmTwoFactor = async (req: Request, res: Response) => {
  try {
    if (!req.user) return sendError(res, 'User not authenticated', 401);
    const { method, code, verification_id } = req.body;
    const user = await twoFactorService.confirmTwoFactorSetup(req.user.user_id, { method, code, verification_id });
    auditService.recordAuditEventSafe({
      req,
      userId: req.user.user_id,
      action: 'two_factor_enabled',
      resourceType: 'auth',
      resourceId: req.user.user_id,
    });
    sendSuccess(res, user, '2-step sign-in is on');
  } catch (error: any) {
    sendError(res, error.message || "Couldn't turn on 2-step sign-in", 400);
  }
};

/* ---------- Password reset ---------- */

/** POST /api/v1/auth/password/forgot — email a 6-digit reset code (same answer for unknown emails) */
export const passwordForgot = async (req: Request, res: Response) => {
  try {
    const result = await authService.startPasswordReset(req.body.email);
    sendSuccess(res, result, 'If that email has an account, we sent it a code', 201);
  } catch (error: any) {
    sendError(res, error.message || 'Could not start the reset', 400);
  }
};

/** POST /api/v1/auth/password/verify — confirm the emailed code */
export const passwordVerify = async (req: Request, res: Response) => {
  try {
    const result = await authService.verifyPasswordReset(req.body);
    sendSuccess(res, result, 'Code confirmed');
  } catch (error: any) {
    sendError(res, error.message || 'Could not confirm the code', 400);
  }
};

/** POST /api/v1/auth/password/resend — send a fresh code */
export const passwordResend = async (req: Request, res: Response) => {
  try {
    const result = await authService.resendPasswordReset(req.body.verification_id);
    sendSuccess(res, result, 'A new code is on its way');
  } catch (error: any) {
    sendError(res, error.message || 'Could not resend the code', 400);
  }
};

/** POST /api/v1/auth/password/reset — set the new password */
export const passwordReset = async (req: Request, res: Response) => {
  try {
    const result = await authService.completePasswordReset(req.body);
    sendSuccess(res, result, 'Password changed');
  } catch (error: any) {
    sendError(res, error.message || 'Could not change your password', 400);
  }
};
