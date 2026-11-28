import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { authRateLimiter, notificationMutationRateLimiter, otpRateLimiter } from '../middlewares/security.middleware';
import { sendError, sendSuccess } from '../../utils/response';
import { resendEmailSignup, verifyEmailSignup } from '../../services/auth/auth.service';
import * as staff from '../../services/seller/staffAccount.service';

/**
 * Store staff.
 *
 * Joining, mounted at /api/v1/auth/staff (no session yet):
 *   POST /join/email     { email } — the email the store owner added → 6-digit code
 *   POST /join/verify    { verification_id, otp }
 *   POST /join/resend    { verification_id }
 *   POST /join/complete  { verification_id, password } → { access_token, refresh_token, user (role "staff") }
 * After that they log in at POST /auth/login with that email and password (account_type "seller").
 *
 * The staff app, mounted at /api/v1/staff (role "staff" only):
 *   GET  /home                     their hub code, drop-offs, collections, on the way (no money)
 *   POST /orders/:id/dropped-off   the item is with our hub team
 */

const run =
  (fn: (req: Request) => Promise<unknown>, okStatus = 200, message?: string) =>
  async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await fn(req), message, okStatus);
    } catch (error: any) {
      sendError(res, error?.message || 'That didn’t work. Try again.', error instanceof staff.StaffError ? error.status : 400);
    }
  };

const verificationId = body('verification_id').isUUID().withMessage('This has expired. Start again.');

export const staffJoinRoutes: Router = Router();

staffJoinRoutes.post(
  '/join/email',
  otpRateLimiter,
  [body('email').isEmail().withMessage('Check your email address. It looks incomplete.').isLength({ max: 255 })],
  handleValidationErrors,
  run(req => staff.startStaffJoin(String(req.body.email)), 201, 'We sent you a 6-digit code')
);

staffJoinRoutes.post(
  '/join/verify',
  otpRateLimiter,
  [verificationId, body('otp').matches(/^\d{6}$/).withMessage('Enter the 6-digit code.')],
  handleValidationErrors,
  run(req => verifyEmailSignup({ verification_id: req.body.verification_id, otp: req.body.otp }))
);

staffJoinRoutes.post(
  '/join/resend',
  otpRateLimiter,
  [verificationId],
  handleValidationErrors,
  run(req => resendEmailSignup(req.body.verification_id))
);

staffJoinRoutes.post(
  '/join/complete',
  authRateLimiter,
  [verificationId, body('password').isString().isLength({ min: 10, max: 128 }).withMessage('Use at least 10 characters.')],
  handleValidationErrors,
  run(req => staff.completeStaffJoin({ verification_id: req.body.verification_id, password: req.body.password }), 201)
);

/** Staff accounts only. Sellers manage their team from /seller/store/staff. */
const staffOnly = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'staff') return sendError(res, 'This is for store staff accounts.', 403);
  next();
};

export const staffAppRoutes: Router = Router();
staffAppRoutes.use(authenticate, staffOnly);

staffAppRoutes.get('/home', run(req => staff.getStaffHome(req.user!.user_id)));

staffAppRoutes.post(
  '/orders/:id/dropped-off',
  notificationMutationRateLimiter,
  [param('id').isUUID()],
  handleValidationErrors,
  run(req => staff.markDroppedOff(req.user!.user_id, req.params.id as string), 200, 'Marked as dropped off')
);
