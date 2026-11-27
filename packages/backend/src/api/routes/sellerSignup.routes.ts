import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { authRateLimiter, otpRateLimiter } from '../middlewares/security.middleware';
import { sendError, sendSuccess } from '../../utils/response';
import { resendEmailSignup, verifyEmailSignup } from '../../services/auth/auth.service';
import { completeSellerSignup, startSellerSignup } from '../../services/seller/sellerApplication.service';

/**
 * Seller sign-up, mounted at /api/v1/auth/seller:
 *   POST /signup/email → POST /signup/verify → POST /signup/complete (makes the account; the application follows)
 */
const router: Router = Router();

const run =
  (fn: (req: Request) => Promise<unknown>, okStatus = 200, message?: string) =>
  async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await fn(req), message, okStatus);
    } catch (error: any) {
      sendError(res, error.message || 'That didn’t work. Try again.', 400);
    }
  };

const verificationId = body('verification_id').isUUID().withMessage('This sign-up has expired. Start again.');

router.post(
  '/signup/email',
  otpRateLimiter,
  [body('email').isEmail().withMessage('Enter a valid business email.').isLength({ max: 255 })],
  handleValidationErrors,
  run(req => startSellerSignup(String(req.body.email)), 201, 'We sent you a 6-digit code')
);

router.post(
  '/signup/verify',
  otpRateLimiter,
  [verificationId, body('otp').matches(/^\d{6}$/).withMessage('Enter the 6-digit code.')],
  handleValidationErrors,
  run(req => verifyEmailSignup({ verification_id: req.body.verification_id, otp: req.body.otp }))
);

router.post(
  '/signup/resend',
  otpRateLimiter,
  [verificationId],
  handleValidationErrors,
  run(req => resendEmailSignup(req.body.verification_id))
);

router.post(
  '/signup/complete',
  authRateLimiter,
  [verificationId, body('password').isString().isLength({ min: 10, max: 128 }).withMessage('Use at least 10 characters.')],
  handleValidationErrors,
  run(req => completeSellerSignup({ verification_id: req.body.verification_id, password: req.body.password }), 201)
);

export default router;
