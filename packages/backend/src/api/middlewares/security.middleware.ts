import rateLimit from 'express-rate-limit';
import config from '../../config';

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
});

/** Stricter limit for auth endpoints (brute-force / OTP abuse) */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: req =>
    req.path === '/refresh-token' ||
    req.path === '/logout' ||
    req.path.endsWith('/refresh-token') ||
    req.path.endsWith('/logout'),
  skipSuccessfulRequests: false,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
});

/** Wallet funding / payment init */
export const paymentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many payment requests. Please try again later.',
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
});
