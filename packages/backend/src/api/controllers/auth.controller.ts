import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import * as authService from '../../services/auth/auth.service';
import logger from '../../utils/logger';

/**
 * Register new user
 * POST /api/v1/auth/register
 */
export const register = async (req: Request, res: Response) => {
  try {
    const { phone_number, email, full_name, password } = req.body;

    const result = await authService.registerUser({
      phone_number,
      email,
      full_name,
      password,
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
    sendError(res, error.message || 'OTP verification failed', 400);
  }
};

/**
 * Login user
 * POST /api/v1/auth/login
 */
export const login = async (req: Request, res: Response) => {
  try {
    const { phone_number, password } = req.body;

    const tokens = await authService.loginUser({
      phone_number,
      password,
    });

    sendSuccess(res, tokens, 'Login successful');
  } catch (error: any) {
    logger.error('Login error:', error);
    sendError(res, error.message || 'Login failed', 401);
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
    const { phone_number } = req.body;

    const result = await authService.resendOTP(phone_number);

    sendSuccess(
      res,
      result,
      'OTP sent successfully. Please check your phone'
    );
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
