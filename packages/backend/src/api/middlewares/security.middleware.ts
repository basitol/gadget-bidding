import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import config from '../../config';
import * as auditService from '../../services/audit/audit.service';

const windowMs = config.rateLimitWindowMs;
const readMaxRequests = config.rateLimitReadMaxRequests;
const writeMaxRequests = config.rateLimitWriteMaxRequests;

const isSafeRead = (method: string) => method === 'GET' || method === 'HEAD';

const isLowRiskPollingPath = (path: string) =>
  path.includes('/notifications') ||
  path.includes('/support') ||
  path.includes('/wallet') ||
  path.endsWith('/auth/me');

const isAuthSessionPath = (path: string) =>
  path.includes('/auth/refresh-token') || path.includes('/auth/logout');

const createScopedRateLimiter = (
  scope: string,
  max: number,
  error: string,
  scopedWindowMs: number = windowMs
) =>
  rateLimit({
    windowMs: scopedWindowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error,
    },
    handler: (req: Request, res: Response, _next, options) => {
      auditService.recordRateLimitHit(req, scope);
      res.status(options.statusCode).json(options.message);
    },
  });

/** General API rate limit */
export const globalRateLimiter = rateLimit({
  windowMs,
  max: req => (isSafeRead(req.method) ? readMaxRequests : writeMaxRequests),
  standardHeaders: true,
  legacyHeaders: false,
  skip: req =>
    isAuthSessionPath(req.path) ||
    (isSafeRead(req.method) && isLowRiskPollingPath(req.path)),
  message: {
    success: false,
    error: 'Too many requests. Please wait a moment and try again.',
  },
  handler: (req: Request, res: Response, _next, options) => {
    auditService.recordRateLimitHit(req, 'global');
    res.status(options.statusCode).json(options.message);
  },
});

/** Extra read budget for frequent low-risk UI polling. */
export const pollingRateLimiter = rateLimit({
  windowMs,
  max: readMaxRequests * 2,
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => !isSafeRead(req.method) || !isLowRiskPollingPath(req.path),
  message: {
    success: false,
    error: 'Too many background refreshes. Please try again shortly.',
  },
  handler: (req: Request, res: Response, _next, options) => {
    auditService.recordRateLimitHit(req, 'polling');
    res.status(options.statusCode).json(options.message);
  },
});

/** Stricter limit for auth endpoints (brute-force / OTP abuse) */
export const authRateLimiter = createScopedRateLimiter(
  'auth',
  config.rateLimitAuthMaxRequests,
  'Too many authentication attempts. Please try again in 15 minutes.'
);

/** Tight limit for OTP verification/resend abuse. */
export const otpRateLimiter = createScopedRateLimiter(
  'otp',
  config.rateLimitOtpMaxRequests,
  'Too many OTP attempts. Please wait before trying again.'
);

/** Refresh/logout should not accidentally force users out during normal use. */
export const authSessionRateLimiter = createScopedRateLimiter(
  'auth_session',
  config.rateLimitAuthSessionMaxRequests,
  'Too many session requests. Please wait a moment and try again.'
);

/** Bidding and buy-now actions. */
export const bidRateLimiter = createScopedRateLimiter(
  'bid',
  config.rateLimitBidMaxRequests,
  'Too many bid attempts. Please slow down and try again.',
  60 * 1000
);

/** Wallet funding initialization. */
export const walletFundingRateLimiter = createScopedRateLimiter(
  'wallet_funding',
  config.rateLimitWalletFundingMaxRequests,
  'Too many wallet funding attempts. Please try again later.'
);

/** Wallet withdrawal requests. */
export const walletWithdrawalRateLimiter = createScopedRateLimiter(
  'wallet_withdrawal',
  config.rateLimitWalletWithdrawalMaxRequests,
  'Too many wallet withdrawal attempts. Please try again later.'
);

/** Payment verification callbacks/polling. */
export const paymentVerificationRateLimiter = createScopedRateLimiter(
  'payment_verification',
  config.rateLimitPaymentVerificationMaxRequests,
  'Too many payment verification requests. Please wait and try again.'
);

/** Support message sends. */
export const supportMessageRateLimiter = createScopedRateLimiter(
  'support_message',
  config.rateLimitSupportMessageMaxRequests,
  'Too many support messages. Please wait before sending another message.'
);

/** Notification mutations such as mark-read/delete. */
export const notificationMutationRateLimiter = createScopedRateLimiter(
  'notification_mutation',
  config.rateLimitNotificationMutationMaxRequests,
  'Too many notification updates. Please wait and try again.'
);

/** Admin write actions. Reads stay governed by the global/polling budgets. */
export const adminMutationRateLimiter = rateLimit({
  windowMs,
  max: config.rateLimitAdminMutationMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => isSafeRead(req.method),
  message: {
    success: false,
    error: 'Too many admin changes. Please wait and try again.',
  },
  handler: (req: Request, res: Response, _next, options) => {
    auditService.recordRateLimitHit(req, 'admin_mutation');
    res.status(options.statusCode).json(options.message);
  },
});

/** Image uploads */
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many upload requests. Please try again later.',
  },
  handler: (req: Request, res: Response, _next, options) => {
    auditService.recordRateLimitHit(req, 'upload');
    res.status(options.statusCode).json(options.message);
  },
});
